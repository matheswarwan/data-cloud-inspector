// Where feedback goes: Send posts it to the developer's feedback service (a Cloudflare Worker
// that stores it in D1; off under the administrator policy disableFeedbackUpload), or Open
// email starts a message to FEEDBACK_EMAIL in the user's own mail app.
export const FEEDBACK_EMAIL = 'mathes.kanagarajan@cloudkettle.com'
export const LINKEDIN_URL = 'https://www.linkedin.com/in/mathesk/'
export const FEEDBACK_ENDPOINT = 'https://query-saver-feedback.mathes-btech.workers.dev/feedback'
