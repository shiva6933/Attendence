function doPost(e) {
  var request = {};
  try {
    if (!e || !e.parameter || !e.parameter.payload) {
      throw new Error("The request was empty. Please try again.");
    }
    request = JSON.parse(e.parameter.payload);
    var data = handleRequest_(request);
    return responsePage_({
      requestId: request.requestId,
      ok: true,
      message: data.message,
      data: data.value
    });
  } catch (error) {
    return responsePage_({
      requestId: request.requestId || null,
      ok: false,
      message: error && error.message
        ? error.message
        : "The attendance request could not be completed."
    });
  }
}

function handleRequest_(request) {
  if (!request || !request.action) {
    throw new Error("Choose an attendance action and try again.");
  }

  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error("The attendance sheet is not connected.");
  }
  var sheets = ensureSheets_(spreadsheet);

  if (request.action === "listEmployees") {
    return {
      message: "Team loaded.",
      value: { employees: getEmployees_(sheets.employees).map(function (employee) {
        return employee.name;
      }) }
    };
  }

  var employee = validateEmployee_(sheets.employees, request.employee, request.pin);
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var state = findOpenShift_(sheets.attendance, employee.name);
    if (request.action === "status") {
      return {
        message: "Your status is up to date.",
        value: state
      };
    }
    if (request.action === "clockIn") {
      if (state.clockedIn) {
        throw new Error("You are already clocked in. Check your status or ask your manager for help.");
      }
      var now = new Date();
      var timezone = spreadsheet.getSpreadsheetTimeZone();
      sheets.attendance.appendRow([
        Utilities.formatDate(now, timezone, "yyyy-MM-dd"),
        employee.name,
        now,
        ""
      ]);
      return {
        message: "Clock-in recorded successfully.",
        value: {
          clockedIn: true,
          loginTime: now.toISOString()
        }
      };
    }
    if (request.action === "clockOut") {
      if (!state.clockedIn || !state.row) {
        throw new Error("There is no open shift to clock out of.");
      }
      var logoutTime = new Date();
      sheets.attendance.getRange(state.row, 4).setValue(logoutTime);
      return {
        message: "Clock-out recorded successfully.",
        value: {
          clockedIn: false,
          logoutTime: logoutTime.toISOString()
        }
      };
    }
    throw new Error("That attendance action is not supported.");
  } finally {
    lock.releaseLock();
  }
}

function ensureSheets_(spreadsheet) {
  var attendance = spreadsheet.getSheetByName("Attendance");
  if (!attendance) {
    attendance = spreadsheet.insertSheet("Attendance");
    attendance.appendRow(["Date", "Employee", "Login time", "Logout time"]);
    attendance.setFrozenRows(1);
    attendance.getRange("C:D").setNumberFormat("yyyy-mm-dd hh:mm:ss");
  } else {
    assertHeaders_(attendance, ["Date", "Employee", "Login time", "Logout time"]);
  }

  var employees = spreadsheet.getSheetByName("Employees");
  if (!employees) {
    employees = spreadsheet.insertSheet("Employees");
    employees.appendRow(["Employee", "PIN", "Active"]);
    employees.setFrozenRows(1);
  } else {
    assertHeaders_(employees, ["Employee", "PIN", "Active"]);
  }

  return { attendance: attendance, employees: employees };
}

function assertHeaders_(sheet, expected) {
  var actual = sheet.getRange(1, 1, 1, expected.length).getDisplayValues()[0];
  for (var i = 0; i < expected.length; i++) {
    if (actual[i] !== expected[i]) {
      throw new Error(
        'The "' + sheet.getName() + '" tab needs these headers in row 1: ' +
        expected.join(", ") + "."
      );
    }
  }
}

function getEmployees_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }
  var rows = sheet.getRange(2, 1, lastRow - 1, 3).getDisplayValues();
  var employees = [];
  var seen = {};
  var seenPins = {};
  rows.forEach(function (row) {
    var name = row[0].trim();
    if (!name || !isActive_(row[2])) {
      return;
    }
    var pin = row[1].trim();
    if (!/^\d{4,12}$/.test(pin)) {
      throw new Error('Add a 4-12 digit PIN for "' + name + '" in the Employees tab.');
    }
    var key = name.toLocaleLowerCase();
    if (seen[key]) {
      throw new Error('The Employees tab contains the name "' + name + '" more than once.');
    }
    if (seenPins[pin]) {
      throw new Error("Each active employee must have a different PIN.");
    }
    seen[key] = true;
    seenPins[pin] = true;
    employees.push({ name: name, pin: pin });
  });
  return employees;
}

function isActive_(value) {
  return ["true", "yes", "1", "active"].indexOf(String(value).trim().toLowerCase()) !== -1;
}

function validateEmployee_(sheet, name, pin) {
  if (!name || !pin) {
    throw new Error("Choose your name and enter your PIN.");
  }
  var employee = getEmployees_(sheet).find(function (item) {
    return item.name === String(name).trim();
  });
  if (!employee || !employee.pin || employee.pin !== String(pin).trim()) {
    throw new Error("The name or PIN is incorrect, or this account is inactive.");
  }
  return employee;
}

function findOpenShift_(sheet, employeeName) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return { clockedIn: false };
  }
  var rows = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
  for (var i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i][1]).trim() === employeeName) {
      var login = rows[i][2];
      var logout = rows[i][3];
      if (login && !logout) {
        return {
          clockedIn: true,
          row: i + 2,
          loginTime: login instanceof Date ? login.toISOString() : null
        };
      }
    }
  }
  return { clockedIn: false };
}

function responsePage_(response) {
  var json = JSON.stringify(response).replace(/</g, "\\u003c");
  var html = "<!doctype html><html><body><script>" +
    "window.top.postMessage(" + json + ', "*");' +
    "</script></body></html>";
  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
