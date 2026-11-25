// Arranca la app (Vite) apuntando a un Supabase simulado y ofrece atajos para las pruebas.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
export const { makeFake } = require('./fake-supabase.cjs');
export const fixtures = require('./fixtures.cjs');

const PORT = Number(process.env.E2E_PORT || 5199);
export const BASE_URL = `http://localhost:${PORT}`;

export async function startApp() {
  const proc = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    env: {
      ...process.env,
      VITE_SUPABASE_URL: 'http://fake-supabase.test',
      VITE_SUPABASE_ANON_KEY: 'anon-test-key',
      DISABLE_HMR: 'true',
    },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(BASE_URL);
      if (res.ok) break;
    } catch {
      // todavía arrancando
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  const browser = await chromium.launch();
  return {
    browser,
    async stop() {
      await browser.close();
      proc.kill();
    },
  };
}

/** Abre una página nueva con el Supabase simulado. */
export async function openPage(browser, seed, { width = 1280, height = 900, path = '/' } = {}) {
  const fake = makeFake(seed);
  const context = await browser.newContext({ viewport: { width, height } });
  await fake.install(context);
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.goto(BASE_URL + path);
  return { page, fake, context, pageErrors };
}

export async function loginAsOwner(page, password = fixtures.OWNER.password) {
  await page.fill('input[placeholder="Usuario o correo electrónico"]', fixtures.OWNER.email);
  await page.fill('input[type="password"]', password);
  await page.locator('form button[type="submit"]').first().click();
}

export async function waitForPanel(page) {
  await page.waitForSelector('text=Panel de Boletas', { timeout: 20_000 });
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
  }
}

export async function openCatalogSection(page, section) {
  await page.locator('aside button', { hasText: 'Catálogo Online' }).first().click();
  await page.waitForSelector('[role=tablist][aria-label="Secciones del catálogo"]', { timeout: 15_000 });
  if (section) await page.locator('[role=tablist][aria-label="Secciones del catálogo"] button', { hasText: section }).click();
}

export const horizontalOverflow = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
