const nodemailer = require('nodemailer');
const taskDAO = require('../dao/taskDAO');

function formatTime(t) {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    const suffix = h >= 12 ? 'PM' : 'AM';
    const disp = h % 12 === 0 ? 12 : h % 12;
    return `${disp}:${m.toString().padStart(2, '0')} ${suffix}`;
}

function formatDisplayDate(dateStr) {
    const [y, m, d] = dateStr.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const weekday = new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' });
    return `${weekday}, ${months[parseInt(m) - 1]} ${parseInt(d)}, ${y}`;
}

const priorityColors = { HIGH: '#ef4444', MEDIUM: '#f97316', LOW: '#22c55e' };
const priorityBg = { HIGH: '#fef2f2', MEDIUM: '#fff7ed', LOW: '#f0fdf4' };

function buildDigestHtml(tasks, dateStr) {
    const displayDate = formatDisplayDate(dateStr);

    if (tasks.length === 0) {
        return `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto;background:#f4f4f8;padding:32px 20px;">
          <div style="background:linear-gradient(135deg,#1a73e8,#6c3fd6);border-radius:16px;padding:28px;text-align:center;color:white;">
            <div style="font-size:32px;margin-bottom:8px;">🎉</div>
            <h2 style="margin:0;font-size:20px;">Nothing scheduled today</h2>
            <p style="margin:8px 0 0;opacity:0.85;font-size:14px;">${displayDate}</p>
          </div>
          <p style="text-align:center;color:#9ca3af;font-size:13px;margin-top:20px;">Enjoy the free time!</p>
        </div>`;
    }

    const sorted = [...tasks].sort((a, b) => (a.due_time || '99:99').localeCompare(b.due_time || '99:99'));
    const today = dateStr;

    const rows = sorted.map(t => {
        const isOverdue = t.due_date && t.due_date < today && t.status !== 'DONE';
        const color = priorityColors[t.priority] || '#9ca3af';
        const bg = priorityBg[t.priority] || '#f9fafb';
        const timeLabel = t.due_time ? formatTime(t.due_time) : 'No time set';

        return `
        <tr>
          <td style="padding:6px 0;">
            <div style="background:${bg};border-left:4px solid ${color};border-radius:10px;padding:14px 16px;">
              <table width="100%" style="border-collapse:collapse;">
                <tr>
                  <td style="vertical-align:top;">
                    <div style="font-weight:700;font-size:15px;color:#1a1a2e;margin-bottom:4px;">
                      ${t.title}${isOverdue ? ' <span style="color:#dc2626;font-size:12px;font-weight:800;">⚠ OVERDUE</span>' : ''}
                    </div>
                      ${t.to_location ? `<div style="font-size:12px;color:#6b7280;margin-bottom:6px;">📍 ${t.to_location}${t.travel_time_mins ? ` · 🚗 ${t.travel_time_mins} min` : ''}</div>` : ''}
                    <span style="display:inline-block;background:white;color:${color};font-size:11px;font-weight:800;
                                 padding:2px 8px;border-radius:10px;text-transform:uppercase;letter-spacing:0.4px;">
                      ${t.priority}
                    </span>
                    <span style="display:inline-block;background:white;color:#6b7280;font-size:11px;font-weight:800;
                                 padding:2px 8px;border-radius:10px;margin-left:6px;text-transform:uppercase;letter-spacing:0.4px;">
                      ${t.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td style="text-align:right;vertical-align:top;white-space:nowrap;color:#6b7280;font-size:13px;font-weight:700;">
                    ${timeLabel}
                  </td>
                </tr>
              </table>
            </div>
          </td>
        </tr>`;
    }).join('');

    return `
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto;background:#f4f4f8;padding:32px 20px;">
      <div style="background:linear-gradient(135deg,#1a73e8,#6c3fd6);border-radius:16px 16px 0 0;padding:24px 24px 20px;color:white;">
        <div style="font-size:12px;opacity:0.75;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:4px;">
          AI Task Manager
        </div>
        <h2 style="margin:0;font-size:22px;">📋 Today's Tasks</h2>
        <p style="margin:6px 0 0;font-size:14px;opacity:0.9;">${displayDate} · ${tasks.length} task${tasks.length !== 1 ? 's' : ''}</p>
      </div>
      <div style="background:white;border-radius:0 0 16px 16px;padding:16px 20px;box-shadow:0 4px 20px rgba(0,0,0,0.06);">
        <table width="100%" style="border-collapse:collapse;">
          ${rows}
        </table>
      </div>
      <p style="text-align:center;color:#9ca3af;font-size:12px;margin-top:16px;">Sent automatically by AI Task Manager</p>
    </div>`;
}

async function sendDailyDigest() {
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });

    const today = new Date().toISOString().split('T')[0];
    const tasks = taskDAO.getTasksByDate(today);
    const html = buildDigestHtml(tasks, today);

    await transporter.sendMail({
        from: `"AI Task Manager" <${process.env.EMAIL_USER}>`,
        to: process.env.REMINDER_EMAIL_TO,
        subject: `📋 Your tasks for ${today} (${tasks.length} task${tasks.length !== 1 ? 's' : ''})`,
        html
    });

    return { sent: true, taskCount: tasks.length };
}

module.exports = { sendDailyDigest };