const getRocketLeagueRating = async () => {
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-first-run',
                '--no-zygote',
                '--disable-web-security',  // ✅ Nouveau
                '--disable-features=IsolateOrigins,site-per-process'  // ✅ Nouveau
            ]
        });

        const page = await browser.newPage();

        // ✅ Anti-détection amélioré
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        await page.setViewport({ width: 1920, height: 1080 });  // ✅ Viewport réaliste
        
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
            Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
            window.chrome = { runtime: {} };  // ✅ Simuler Chrome
        });

        console.log('Navigation vers Tracker.gg...');
        await page.goto('https://tracker.gg/rocket-league/profile/psn/Snowthy/overview', {
            waitUntil: 'networkidle2',  // ✅ Changé de networkidle0
            timeout: 90000  // ✅ 90 secondes au lieu de 60
        });

        console.log('Attente du chargement...');
        await new Promise(resolve => setTimeout(resolve, 8000));  // ✅ 8 secondes au lieu de 4

        console.log('Scroll...');
        await page.evaluate(() => window.scrollTo(0, 500));
        await new Promise(resolve => setTimeout(resolve, 3000));  // ✅ 3 secondes

        await page.evaluate(() => window.scrollTo(0, 1000));
        await new Promise(resolve => setTimeout(resolve, 3000));  // ✅ 3 secondes

        console.log('Recherche du MMR...');
        
        // ✅ Essayer plusieurs sélecteurs
        const selectors = [
            'div.mmr',
            '.mmr',
            '[class*="mmr"]',
            'div[class*="rating"]'
        ];
        
        let foundSelector = null;
        for (const selector of selectors) {
            try {
                await page.waitForSelector(selector, { timeout: 15000 });  // ✅ 15 secondes
                foundSelector = selector;
                console.log(`✅ Trouvé avec: ${selector}`);
                break;
            } catch (e) {
                console.log(`❌ Échec avec: ${selector}`);
            }
        }
        
        if (!foundSelector) {
            // ✅ Capture d'écran pour debug
            await page.screenshot({ path: 'debug-screenshot.png' });
            throw new Error('Aucun sélecteur MMR trouvé');
        }

        const mmrData = await page.evaluate(() => {
            const mmrDivs = Array.from(document.querySelectorAll('div.mmr .value'));

            for (let i = 0; i < mmrDivs.length; i++) {
                const div = mmrDivs[i];
                const mmrText = div.textContent.trim();
                const mmrValue = parseInt(mmrText.replace(/,/g, ''));

                let parent = div;
                for (let j = 0; j < 20; j++) {
                    parent = parent.parentElement;
                    if (!parent) break;

                    const text = parent.textContent;

                    if (text.includes('Ranked Doubles 2v2') &&
                        !text.includes('Casual') &&
                        !text.includes('Ranked Standard 3v3') &&
                        !text.includes('Ranked Duel 1v1')) {

                        if (text.includes('Current') || text.includes('Top')) {
                            return {
                                mmr: mmrValue,
                                mmrFormatted: mmrText,
                                found: true
                            };
                        }
                    }
                }
            }

            if (mmrDivs.length > 2) {
                const div = mmrDivs[2];
                const mmrText = div.textContent.trim();
                const mmrValue = parseInt(mmrText.replace(/,/g, ''));

                return {
                    mmr: mmrValue,
                    mmrFormatted: mmrText,
                    found: true,
                    fallback: true
                };
            }

            return { found: false };
        });

        await browser.close();
        return mmrData;

    } catch (error) {
        console.error('Erreur:', error.message);
        if (browser) await browser.close();
        throw error;
    }
}
