#!/usr/bin/env node

/**
 * Script de test pour la modal pricing
 * Utilise Puppeteer pour vérifier l'affichage de la modal
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function testPricingModal() {
  console.log('🚀 Lancement du test de la modal pricing...\n');

  const browser = await puppeteer.launch({
    headless: false, // Mode visible pour voir ce qui se passe
    defaultViewport: {
      width: 1920,
      height: 1080
    }
  });

  try {
    const page = await browser.newPage();

    // Créer un dossier pour les screenshots
    const screenshotDir = path.join(__dirname, 'screenshots');
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir);
    }

    console.log('📱 Navigation vers la page jobs...');
    await page.goto('http://localhost:3000/jobs', {
      waitUntil: 'networkidle0',
      timeout: 10000
    });

    // Screenshot de la page initiale
    await page.screenshot({
      path: path.join(screenshotDir, '01-page-jobs.png'),
      fullPage: true
    });
    console.log('✅ Screenshot 1: Page jobs');

    // Attendre un peu pour que la page soit complètement chargée
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Chercher un bouton qui ouvre la modal pricing
    console.log('\n🔍 Recherche du bouton pour ouvrir la modal...');

    // Essayer de trouver un bouton contenant "Analyse" ou "CV" ou "Premium"
    const selectors = [
      'button:has-text("Analyser")',
      'button:has-text("Premium")',
      'button:has-text("Pro")',
      '[data-testid*="pricing"]',
      'button[class*="upgrade"]'
    ];

    let buttonFound = false;
    for (const selector of selectors) {
      try {
        await page.waitForSelector(selector, { timeout: 2000 });
        console.log(`✅ Bouton trouvé avec le sélecteur: ${selector}`);
        await page.click(selector);
        buttonFound = true;
        break;
      } catch (e) {
        // Continue avec le prochain sélecteur
      }
    }

    if (!buttonFound) {
      console.log('⚠️  Bouton non trouvé automatiquement. Naviguation vers /pricing...');
      await page.goto('http://localhost:3000/pricing', {
        waitUntil: 'networkidle0'
      });
    }

    // Attendre que la modal apparaisse
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Screenshot de la modal
    await page.screenshot({
      path: path.join(screenshotDir, '02-pricing-modal.png'),
      fullPage: true
    });
    console.log('✅ Screenshot 2: Modal pricing');

    // Vérifier les dimensions de la modal
    const modalDimensions = await page.evaluate(() => {
      const modal = document.querySelector('[role="dialog"]');
      if (modal) {
        const rect = modal.getBoundingClientRect();
        return {
          width: rect.width,
          height: rect.height,
          top: rect.top,
          bottom: rect.bottom,
          isVisible: rect.bottom <= window.innerHeight,
          viewportHeight: window.innerHeight,
          overflow: rect.bottom - window.innerHeight
        };
      }
      return null;
    });

    if (modalDimensions) {
      console.log('\n📊 Dimensions de la modal:');
      console.log(`   Largeur: ${modalDimensions.width}px`);
      console.log(`   Hauteur: ${modalDimensions.height}px`);
      console.log(`   Position top: ${modalDimensions.top}px`);
      console.log(`   Position bottom: ${modalDimensions.bottom}px`);
      console.log(`   Hauteur viewport: ${modalDimensions.viewportHeight}px`);

      if (!modalDimensions.isVisible) {
        console.log(`\n⚠️  PROBLÈME DÉTECTÉ !`);
        console.log(`   La modal dépasse de ${modalDimensions.overflow}px en bas`);
        console.log(`   La modal est coupée !`);
      } else {
        console.log(`\n✅ La modal est entièrement visible`);
      }
    }

    // Test responsive - Mobile
    console.log('\n📱 Test responsive mobile (375x667)...');
    await page.setViewport({
      width: 375,
      height: 667
    });
    await new Promise(resolve => setTimeout(resolve, 500));

    await page.screenshot({
      path: path.join(screenshotDir, '03-modal-mobile.png'),
      fullPage: true
    });
    console.log('✅ Screenshot 3: Modal mobile');

    // Test responsive - Tablet
    console.log('📱 Test responsive tablet (768x1024)...');
    await page.setViewport({
      width: 768,
      height: 1024
    });
    await new Promise(resolve => setTimeout(resolve, 500));

    await page.screenshot({
      path: path.join(screenshotDir, '04-modal-tablet.png'),
      fullPage: true
    });
    console.log('✅ Screenshot 4: Modal tablet');

    // Vérifier le contraste des textes
    console.log('\n🎨 Vérification des contrastes...');
    const contrastIssues = await page.evaluate(() => {
      const issues = [];
      const texts = document.querySelectorAll('[role="dialog"] *');

      texts.forEach(el => {
        const style = window.getComputedStyle(el);
        const color = style.color;
        const bgColor = style.backgroundColor;
        const fontSize = parseFloat(style.fontSize);

        if (el.textContent.trim() && fontSize < 10) {
          issues.push({
            text: el.textContent.trim().substring(0, 30),
            fontSize: fontSize,
            element: el.tagName
          });
        }
      });

      return issues;
    });

    if (contrastIssues.length > 0) {
      console.log('⚠️  Textes avec taille < 10px trouvés:');
      contrastIssues.forEach(issue => {
        console.log(`   - "${issue.text}": ${issue.fontSize}px (${issue.element})`);
      });
    } else {
      console.log('✅ Pas de problème de taille de texte détecté');
    }

    console.log('\n📸 Tous les screenshots sont dans le dossier: ./screenshots/');
    console.log('✅ Test terminé avec succès !');

  } catch (error) {
    console.error('\n❌ Erreur pendant le test:', error.message);
  } finally {
    await browser.close();
  }
}

// Exécuter le test
testPricingModal().catch(console.error);
