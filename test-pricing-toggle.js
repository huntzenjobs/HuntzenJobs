#!/usr/bin/env node

/**
 * Script de test pour le toggle annuel/mensuel
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function testPricingToggle() {
  console.log('🚀 Test du toggle annuel/mensuel...\n');

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: {
      width: 1920,
      height: 1080
    }
  });

  try {
    const page = await browser.newPage();

    const screenshotDir = path.join(__dirname, 'screenshots');
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir);
    }

    console.log('📱 Navigation vers /pricing...');
    await page.goto('http://localhost:3000/pricing', {
      waitUntil: 'networkidle0',
      timeout: 10000
    });

    // Screenshot vue mensuelle
    await page.screenshot({
      path: path.join(screenshotDir, 'toggle-01-monthly.png'),
      fullPage: true
    });
    console.log('✅ Screenshot 1: Vue mensuelle');

    // Vérifier les prix mensuels
    const monthlyPrices = await page.evaluate(() => {
      const priceElements = Array.from(document.querySelectorAll('.text-5xl'));
      return priceElements.map(el => el.textContent?.trim());
    });
    console.log('\n💰 Prix mensuels détectés:', monthlyPrices);

    // Cliquer sur le toggle
    console.log('\n🔄 Activation du mode annuel...');
    await page.click('button[class*="w-16"]');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Screenshot vue annuelle
    await page.screenshot({
      path: path.join(screenshotDir, 'toggle-02-yearly.png'),
      fullPage: true
    });
    console.log('✅ Screenshot 2: Vue annuelle');

    // Vérifier les prix annuels
    const yearlyPrices = await page.evaluate(() => {
      const priceElements = Array.from(document.querySelectorAll('.text-5xl'));
      const savings = Array.from(document.querySelectorAll('.bg-green-100'));
      return {
        prices: priceElements.map(el => el.textContent?.trim()),
        savingsBadges: savings.map(el => el.textContent?.trim())
      };
    });
    console.log('\n💰 Prix annuels (équivalent mensuel):', yearlyPrices.prices);
    console.log('🎉 Badges d\'économie:', yearlyPrices.savingsBadges);

    // Vérifier le badge "Économisez jusqu'à 20%"
    const mainSavingsBadge = await page.evaluate(() => {
      const badge = document.querySelector('span:has-text("Économisez jusqu")');
      return badge?.textContent?.trim() || 'Non trouvé';
    });
    console.log('📊 Badge principal:', mainSavingsBadge);

    // Test responsive mobile
    console.log('\n📱 Test responsive mobile...');
    await page.setViewport({ width: 375, height: 667 });
    await new Promise(resolve => setTimeout(resolve, 500));

    await page.screenshot({
      path: path.join(screenshotDir, 'toggle-03-mobile-yearly.png'),
      fullPage: true
    });
    console.log('✅ Screenshot 3: Mobile vue annuelle');

    // Retour au mode mensuel en mobile
    await page.click('button[class*="w-16"]');
    await new Promise(resolve => setTimeout(resolve, 500));

    await page.screenshot({
      path: path.join(screenshotDir, 'toggle-04-mobile-monthly.png'),
      fullPage: true
    });
    console.log('✅ Screenshot 4: Mobile vue mensuelle');

    // Test tablet
    console.log('\n📱 Test responsive tablet...');
    await page.setViewport({ width: 768, height: 1024 });
    await new Promise(resolve => setTimeout(resolve, 500));

    await page.screenshot({
      path: path.join(screenshotDir, 'toggle-05-tablet.png'),
      fullPage: true
    });
    console.log('✅ Screenshot 5: Tablet');

    console.log('\n📸 Tous les screenshots sont dans ./screenshots/');
    console.log('✅ Test du toggle terminé avec succès !');

  } catch (error) {
    console.error('\n❌ Erreur:', error.message);
  } finally {
    await browser.close();
  }
}

testPricingToggle().catch(console.error);
