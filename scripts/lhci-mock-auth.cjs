/**
 * Login mock prima delle route /app/* per Lighthouse CI (build e2e, auth in sessionStorage).
 */
module.exports = async (browser, context) => {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:4210/login', { waitUntil: 'networkidle0' });
  await page.type('#login-email', 'owner@vestiflow.test');
  await page.type('#login-password', 'owner123');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/app\/dashboard/, { timeout: 30_000 });
  await page.close();
};
