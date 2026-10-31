# Waffle Castle Attendance

A static attendance clock for GitHub Pages, with a Google Sheet as the shared record for all staff. The app records server-side login and logout times, prevents duplicate clock-ins, and allows one open shift per employee.

The Waffle Castle logo is stored in `assets/waffle-castle-logo.png` and displayed in the app header.

## Set up the shared attendance sheet

1. Create a Google Sheet owned by the shop manager. Keep it private; staff do not need direct access to it.
2. In that Sheet, open **Extensions → Apps Script**.
3. Replace the editor contents with [`Code.gs`](./Code.gs), then save the project.
4. In the Sheet, create an `Employees` tab with these exact columns and add the staff:

   | Employee | PIN | Active |
   | --- | --- | --- |
   | Example Staff | 123456 | TRUE |

   Use a different 4-12 digit PIN for each person. Set `Active` to `TRUE` to allow clock-ins, or `FALSE` to disable an account. Do not share the sheet with staff: its PIN column and attendance records should remain manager-only.
5. In Apps Script, choose **Deploy → New deployment → Web app**. Set **Execute as** to **Me** and **Who has access** to **Anyone**. Deploy, authorize the requested spreadsheet access, and copy the web app URL ending in `/exec`.
6. Put that URL in `config.js` as the `scriptUrl` value. Keep the quotes around the URL. Set the Google Sheet's time zone to the shop's local time zone; it determines the recorded attendance times.
7. Publish the project to GitHub and enable **Settings → Pages** for the branch/folder containing `index.html`.
8. Open the published site, select a staff member, enter their PIN, and choose **Check my status** before clocking in or out.

The web app must be accessible to anyone so GitHub Pages can send requests without a Google sign-in. The Apps Script runs as the manager and checks each employee's PIN before changing the sheet. Use PINs that are not reused elsewhere and keep the spreadsheet private.

## Download the monthly Excel file

The `Attendance` tab is the shared source of truth. In Google Sheets, filter its `Date` column to the month you want, then choose **File → Download → Microsoft Excel (.xlsx)**. Login and logout times are stored in the spreadsheet's time zone.

## Notes

- The static site does not contain attendance records; clearing browser data or switching devices will not erase the shared Sheet.
- If an employee clocks in but forgets to clock out, a manager should correct the open row in the `Attendance` tab before that employee clocks in again.
- Apps Script web app deployments can use a versioned deployment. After changing `Code.gs`, update the deployment to a new version if the live endpoint does not include your changes.
