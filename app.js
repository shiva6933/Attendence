(function () {
  "use strict";

  const config = window.ATTENDANCE_CONFIG || {};
  const employeeSelect = document.getElementById("employee");
  const pinInput = document.getElementById("pin");
  const statusButton = document.getElementById("status-button");
  const clockInButton = document.getElementById("clock-in");
  const clockOutButton = document.getElementById("clock-out");
  const statusPanel = document.getElementById("status-panel");
  const statusText = document.getElementById("status-text");
  const notice = document.getElementById("notice");
  const responseFrame = document.getElementById("response-frame");
  const setupWarning = document.getElementById("setup-warning");
  const pendingRequests = new Map();
  let requestInProgress = false;
  let clockedIn = null;

  function updateClock() {
    const now = new Date();
    document.getElementById("current-time").textContent =
      new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit"
      }).format(now);
    document.getElementById("today").textContent =
      new Intl.DateTimeFormat(undefined, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
      }).format(now);
  }

  function showNotice(message, isSuccess) {
    notice.textContent = message;
    notice.hidden = false;
    notice.classList.toggle("is-success", Boolean(isSuccess));
  }

  function clearNotice() {
    notice.hidden = true;
    notice.textContent = "";
    notice.classList.remove("is-success");
  }

  function setStatus(message, isClockedIn) {
    clockedIn = isClockedIn;
    statusText.textContent = message;
    statusPanel.classList.toggle("is-in", isClockedIn === true);
    updateButtons();
  }

  function updateButtons() {
    const ready = Boolean(employeeSelect.value && pinInput.value) && !requestInProgress;
    statusButton.disabled = !ready;
    clockInButton.disabled = !ready || clockedIn !== false;
    clockOutButton.disabled = !ready || clockedIn !== true;
  }

  function makeRequest(payload) {
    return new Promise(function (resolve, reject) {
      if (!config.scriptUrl) {
        reject(new Error("Attendance is not connected yet. Ask your manager to finish setup."));
        return;
      }

      const requestId = window.crypto && window.crypto.randomUUID
        ? window.crypto.randomUUID()
        : String(Date.now()) + "-" + Math.random().toString(16).slice(2);
      const requestPayload = Object.assign({}, payload, { requestId: requestId });
      const form = document.createElement("form");
      const field = document.createElement("input");

      form.method = "post";
      form.action = config.scriptUrl;
      form.target = responseFrame.name;
      form.hidden = true;
      field.type = "hidden";
      field.name = "payload";
      field.value = JSON.stringify(requestPayload);
      form.appendChild(field);
      document.body.appendChild(form);

      const timeoutId = window.setTimeout(function () {
        pendingRequests.delete(requestId);
        form.remove();
        reject(new Error("The attendance service did not respond. Please check your connection and try again."));
      }, 20000);

      pendingRequests.set(requestId, {
        resolve: resolve,
        reject: reject,
        timeoutId: timeoutId,
        form: form
      });

      try {
        form.submit();
      } catch (error) {
        window.clearTimeout(timeoutId);
        pendingRequests.delete(requestId);
        form.remove();
        reject(new Error("Could not send your attendance request. Please try again."));
      }
    });
  }

  window.addEventListener("message", function (event) {
    if (event.source !== responseFrame.contentWindow || !event.data) {
      return;
    }

    const pending = pendingRequests.get(event.data.requestId);
    if (!pending) {
      return;
    }
    window.clearTimeout(pending.timeoutId);
    pending.form.remove();
    pendingRequests.delete(event.data.requestId);

    if (event.data.ok) {
      pending.resolve(event.data);
    } else {
      pending.reject(new Error(event.data.message || "The attendance request could not be completed."));
    }
  });

  function setBusy(isBusy) {
    requestInProgress = isBusy;
    employeeSelect.disabled = isBusy || employeeSelect.options.length < 2;
    pinInput.disabled = isBusy;
    updateButtons();
  }

  async function checkStatus() {
    clearNotice();
    if (!employeeSelect.value || !pinInput.value) {
      showNotice("Choose your name and enter your PIN first.", false);
      return;
    }

    setBusy(true);
    statusText.textContent = "Checking your attendance…";
    try {
      const response = await makeRequest({
        action: "status",
        employee: employeeSelect.value,
        pin: pinInput.value
      });
      const data = response.data;
      if (data.clockedIn) {
        const time = data.loginTime
          ? " since " + new Intl.DateTimeFormat(undefined, {
            hour: "numeric",
            minute: "2-digit"
          }).format(new Date(data.loginTime))
          : "";
        setStatus("You are clocked in" + time + ".", true);
      } else {
        setStatus("You are currently clocked out.", false);
      }
    } catch (error) {
      clockedIn = null;
      setStatus("Check your name and PIN, then try again.", null);
      showNotice(error.message, false);
    } finally {
      setBusy(false);
    }
  }

  async function recordAttendance(action) {
    clearNotice();
    if (!employeeSelect.value || !pinInput.value) {
      showNotice("Choose your name and enter your PIN first.", false);
      return;
    }

    setBusy(true);
    statusText.textContent = action === "clockIn"
      ? "Recording your clock-in…"
      : "Recording your clock-out…";
    try {
      const response = await makeRequest({
        action: action,
        employee: employeeSelect.value,
        pin: pinInput.value
      });
      const data = response.data;
      if (data.clockedIn) {
        const time = data.loginTime
          ? " at " + new Intl.DateTimeFormat(undefined, {
            hour: "numeric",
            minute: "2-digit"
          }).format(new Date(data.loginTime))
          : "";
        setStatus("You are clocked in" + time + ".", true);
      } else {
        setStatus("You are currently clocked out.", false);
      }
      showNotice(response.message, true);
    } catch (error) {
      clockedIn = null;
      setStatus("Attendance was not confirmed. Check your status before retrying.", null);
      showNotice(error.message, false);
    } finally {
      setBusy(false);
    }
  }

  async function loadEmployees() {
    try {
      const response = await makeRequest({ action: "listEmployees" });
      const employees = response.data.employees;
      employeeSelect.replaceChildren(new Option("Select your name", ""));
      employees.forEach(function (employee) {
        employeeSelect.add(new Option(employee, employee));
      });
      employeeSelect.disabled = false;
      if (employees.length === 0) {
        employeeSelect.replaceChildren(new Option("Ask your manager to add staff", ""));
        employeeSelect.disabled = true;
      }
      updateButtons();
    } catch (error) {
      employeeSelect.replaceChildren(new Option("Could not load team", ""));
      employeeSelect.disabled = true;
      showNotice(error.message, false);
      setupWarning.hidden = Boolean(config.scriptUrl);
    }
  }

  employeeSelect.addEventListener("change", function () {
    clockedIn = null;
    setStatus("Enter your PIN, then check your status.", null);
    clearNotice();
    updateButtons();
  });
  pinInput.addEventListener("input", function () {
    clockedIn = null;
    setStatus("Check your status before clocking in or out.", null);
    clearNotice();
    updateButtons();
  });
  statusButton.addEventListener("click", checkStatus);
  clockInButton.addEventListener("click", function () {
    recordAttendance("clockIn");
  });
  clockOutButton.addEventListener("click", function () {
    recordAttendance("clockOut");
  });

  updateClock();
  window.setInterval(updateClock, 1000);
  if (!config.scriptUrl) {
    setupWarning.hidden = false;
    employeeSelect.replaceChildren(new Option("Attendance is not set up", ""));
    employeeSelect.disabled = true;
    showNotice("Ask your manager to connect the attendance sheet before using the clock.", false);
  } else {
    loadEmployees();
  }
})();
