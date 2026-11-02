import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chromium, expect } from '@playwright/test';
import { pool } from '../server/db.mjs';

const baseURL = process.env.TEST_BASE_URL || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null);
if (!baseURL) throw new Error('Set TEST_BASE_URL to the running app URL.');

after(async () => { await pool.end(); });

test('phone and laptop: real signup, refresh, logout, validation and login', async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || execFileSync('which', ['chromium'], { encoding: 'utf8' }).trim(),
    headless: true, args: ['--no-sandbox'],
  });
  const emails = [];
  try {
    for (const width of [375, 1366]) {
      const context = await browser.newContext({ baseURL, viewport: { width, height: 900 } });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const email = `browser-${randomUUID()}@example.test`;
      emails.push(email);
      const password = 'browser-test-only-password';
      const clickSubmit = () => page.getByRole('button', { name: 'Create account', exact: true }).click();
      async function expectDashboard() {
        await expect(page).toHaveURL(/\/dashboard$/);
        await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
        await expect(page.getByText('Your dashboard fills in as you log sessions.', { exact: true })).toBeVisible();
      }
      async function fits() {
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
        for (const control of await page.locator('main input, main button:visible, header button:visible').all()) {
          assert.ok(await control.evaluate(el => {
            const style = getComputedStyle(el);
            return Math.max(parseFloat(style.height) || 0, parseFloat(style.minHeight) || 0) >= 44;
          }));
        }
      }
      async function logout() {
        if (width === 375) await page.getByRole('button', { name: 'Open menu' }).click();
        await page.getByRole('button', { name: 'Log out', exact: true }).click();
        await expect(page).toHaveURL(/\/login$/);
      }
      await page.goto('/');
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toHaveCount(0);
      await page.getByRole('link', { name: 'Create an account' }).click();
      await clickSubmit();
      await expect(page.getByText('Please fill in all fields.', { exact: true })).toBeVisible();
      await page.getByLabel('Email', { exact: true }).fill('invalid');
      await page.getByLabel('Password', { exact: true }).fill('short');
      await page.getByLabel('Confirm password', { exact: true }).fill('short');
      await clickSubmit();
      await expect(page.getByText('Please enter a valid email address.', { exact: true })).toBeVisible();
      await page.getByLabel('Email', { exact: true }).fill(email.toUpperCase());
      await clickSubmit();
      await expect(page.getByText('Password must be at least 8 characters.', { exact: true })).toBeVisible();
      await page.getByLabel('Password', { exact: true }).fill(password);
      await clickSubmit();
      await expect(page.getByText("Passwords don't match.", { exact: true })).toBeVisible();
      await page.getByLabel('Confirm password', { exact: true }).fill(password);
      await fits();
      await clickSubmit();
      await expectDashboard();
      if (width === 375) await page.getByRole('button', { name: 'Open menu' }).click();
      await expect(page.getByText(email, { exact: true }).last()).toBeVisible();
      if (width === 375) await page.getByRole('button', { name: 'Close menu' }).click();
      await fits();
      await page.reload();
      await expectDashboard();
      await page.goto('/login');
      await expectDashboard();
      await logout();
      await page.goto('/');
      await expect(page).toHaveURL(/\/login$/);
      await page.getByRole('link', { name: 'Create an account' }).click();
      await page.getByLabel('Email', { exact: true }).fill(email);
      await page.getByLabel('Password', { exact: true }).fill(password);
      await page.getByLabel('Confirm password', { exact: true }).fill(password);
      await clickSubmit();
      await expect(page.getByText('An account with this email already exists. Try logging in.', { exact: true })).toBeVisible();
      await page.getByRole('link', { name: 'Log in', exact: true }).click();
      await page.getByLabel('Email', { exact: true }).fill(email);
      await page.getByLabel('Password', { exact: true }).fill('wrong-password');
      await page.getByRole('button', { name: 'Log in', exact: true }).click();
      await expect(page.getByText('Email or password is incorrect.', { exact: true })).toBeVisible();
      await page.getByLabel('Password', { exact: true }).fill(password);
      await page.getByRole('button', { name: 'Log in', exact: true }).click();
      await expectDashboard();
      await logout();
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally {
    const ids = (await pool.query('SELECT id FROM users WHERE email=ANY($1::text[])', [emails])).rows.map(row => row.id);
    await pool.query("DELETE FROM login_sessions WHERE (sess->>'userId')::int=ANY($1::int[])", [ids]);
    await pool.query('DELETE FROM users WHERE id=ANY($1::int[])', [ids]);
    await browser.close();
  }
});

test('session logging is visible without opening the menu at 375px and remains primary on laptop', async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || execFileSync('which', ['chromium'], { encoding: 'utf8' }).trim(),
    headless: true, args: ['--no-sandbox'],
  });
  const email = `log-primary-${randomUUID()}@example.test`;
  const context = await browser.newContext({ baseURL, viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  async function assertFits() {
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  }
  async function assertPrimary() {
    const link = page.locator('main').getByRole('link', { name: '+ Log session', exact: true });
    await expect(link).toBeVisible();
    await expect(link).toBeInViewport({ ratio: 1 });
    assert.ok(await link.evaluate(el => {
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return box.height >= 44 && box.width >= 44
        && style.backgroundColor === 'rgb(46, 158, 107)'
        && style.color === 'rgb(255, 255, 255)';
    }));
    const secondary = page.getByRole('button', { name: 'Export to Excel', exact: true });
    await expect(secondary).toBeVisible();
    assert.ok(await link.evaluate((el, button) =>
      Boolean(el.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING),
    await secondary.elementHandle()));
    await assertFits();
    return link;
  }
  try {
    const status = await context.request.get('/api/auth/status');
    const { csrfToken } = await status.json();
    const signup = await context.request.post('/api/auth/signup', {
      headers: { 'X-CSRF-Token': csrfToken },
      data: { email, password: 'primary-action-test-password!', confirmPassword: 'primary-action-test-password!' },
    });
    assert.equal(signup.status(), 201);
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
    const menu = page.getByRole('button', { name: 'Open menu', exact: true });
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    const primary = await assertPrimary();
    const headingBox = await page.getByRole('heading', { name: 'Dashboard', exact: true }).boundingBox();
    const primaryBox = await primary.boundingBox();
    assert.ok(primaryBox.y >= headingBox.y + headingBox.height);
    assert.ok(Math.abs(primaryBox.width - await page.locator('main').evaluate(el => {
      const style = getComputedStyle(el);
      return el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    })) <= 2);
    const compact = page.locator('header').getByRole('link', { name: /Log/ });
    await expect(compact).toBeVisible();
    assert.ok(await compact.evaluate(el => {
      const box = el.getBoundingClientRect();
      return box.height >= 44 && box.width >= 44;
    }));
    await primary.click();
    await expect(page).toHaveURL(/\/sessions\/new$/);
    await expect(page.getByRole('heading', { name: 'Log a session', exact: true })).toBeVisible();
    await expect(page.locator('header').getByRole('link', { name: /Log/ })).toBeVisible();
    await page.goto('/sessions');
    await assertPrimary();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export to Excel', exact: true }).click();
    const workbook = await download;
    assert.match(workbook.suggestedFilename(), /^InterviewPrep_\d{4}-\d{2}-\d{2}\.xlsx$/);
    assert.equal(await workbook.failure(), null);
    await workbook.delete();
    await compact.click();
    await expect(page).toHaveURL(/\/sessions\/new$/);
    await page.setViewportSize({ width: 1366, height: 900 });
    for (const route of ['/dashboard', '/sessions']) {
      await page.goto(route);
      const laptopPrimary = await assertPrimary();
      const heading = await page.locator('main h1').boundingBox();
      const action = await laptopPrimary.boundingBox();
      assert.ok(action.x > heading.x + heading.width);
      assert.ok(action.y < heading.y + heading.height && action.y + action.height > heading.y);
    }
  } finally {
    await context.close();
    await browser.close();
    const ids = (await pool.query('SELECT id FROM users WHERE email=$1', [email])).rows.map(row => row.id);
    await pool.query("DELETE FROM login_sessions WHERE (sess->>'userId')::int=ANY($1::int[])", [ids]);
    await pool.query('DELETE FROM users WHERE id=ANY($1::int[])', [ids]);
  }
});
