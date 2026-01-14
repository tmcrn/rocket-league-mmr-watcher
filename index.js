const puppeteer = require('puppeteer');
const fs = require('fs').promises;

const DATA_FILE = 'mmr-history.json';
const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK;

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
                '--no-zygote'
            ]
            // ✅ Supprimé executablePath pour utiliser le Chrome de Puppeteer
        });

        const page = await browser.newPage();

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => false,
            });
        });

        console.log('📍 Navigation vers Tracker.gg...');
        await page.goto('https://tracker.gg/rocket-league/profile/psn/Snowthy/overview', {
            waitUntil: 'networkidle0',
            timeout: 60000
        });

        console.log('⏳ Attente du chargement...');
        await new Promise(resolve => setTimeout(resolve, 4000));

        console.log('📜 Scroll...');
        await page.evaluate(() => window.scrollTo(0, 500));
        await new Promise(resolve => setTimeout(resolve, 2000));

        await page.evaluate(() => window.scrollTo(0, 1000));
        await new Promise(resolve => setTimeout(resolve, 2000));

        console.log('🔍 Recherche du MMR...');
        await page.waitForSelector('div.mmr', { timeout: 10000 });

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
                        !text.includes('Casual')   &&
                        !text.includes('Ranked Standard 3v3')   &&
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
        console.error('💥 Erreur:', error.message);
        if (browser) await browser.close();
        throw error;
    }
}

const sendDiscordNotification = async (oldMMR, newMMR, change) => {
    if (!DISCORD_WEBHOOK) {
        console.log('⚠️  Pas de webhook Discord configuré');
        return;
    }


    const rank = getDivisionFromMMR(newMMR);
    const emoji = change > 0 ? '📈' : '📉';
    const color = change > 0 ? 3066993 : 15158332;

    const embed = {
        title: `${emoji} MMR Update - Ranked Doubles 2v2 : ${newMMR}`,
        color: color,
        fields: [
            {
                name: 'MMR',
                value: `${newMMR}`,
                inline: true
            },
            {
                name: 'Rank suivant',
                value: `${rank}`,
                inline: true
            },
            {
                name: 'Changement',
                value: `${change > 0 ? '+' : ''}${change}`,
                inline: true
            },

        ],
        timestamp: new Date().toISOString(),
        footer: {
            text: 'Rocket League MMR Tracker'
        }
    };

    try {
        const response = await fetch(DISCORD_WEBHOOK, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ embeds: [embed] })
        });

        if (response.ok) {
            console.log('✅ Notification Discord envoyée');
        } else {
            console.error('❌ Erreur Discord:', response.statusText);
        }
    } catch (error) {
        console.error('❌ Erreur envoi Discord:', error.message);
    }
}

const saveMMRData = async (mmrData) => {
    try {
        let history = { entries: [] };

        try {
            const data = await fs.readFile(DATA_FILE, 'utf8');
            history = JSON.parse(data);
        } catch (err) {
            console.log('📝 Création du fichier historique');
        }

        const entry = {
            timestamp: new Date().toISOString(),
            mmr: mmrData.mmr,
            mmrFormatted: mmrData.mmrFormatted
        };

        history.entries.push(entry);

        if (history.entries.length > 100) {
            history.entries = history.entries.slice(-100);
        }

        await fs.writeFile(DATA_FILE, JSON.stringify(history, null, 2));
        console.log('💾 Données sauvegardées');

        return entry;
    } catch (error) {
        console.error('❌ Erreur sauvegarde:', error.message);
        throw error;
    }
}

const getLastMMR = async () => {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        const history = JSON.parse(data);

        if (history.entries.length > 0) {
            return history.entries[history.entries.length - 1].mmr;
        }
    } catch (err) {
        console.log('📝 Pas d\'historique précédent');
    }
    return null;
}

// Main
(async () => {
    try {
        console.log('🚀 Lancement du tracker MMR...\n');

        const mmrData = await getRocketLeagueRating();

        if (!mmrData || !mmrData.found) {
            console.error('❌ Impossible de récupérer le MMR');
            process.exit(1);
        }

        console.log(`\n🎯 MMR actuel: ${mmrData.mmrFormatted} (${mmrData.mmr})`);

        const lastMMR = await getLastMMR();
        await saveMMRData(mmrData);

        if (lastMMR !== null && lastMMR !== mmrData.mmr) {
            const change = mmrData.mmr - lastMMR;
            console.log(`📊 Changement détecté: ${change > 0 ? '+' : ''}${change}`);
            await sendDiscordNotification(lastMMR, mmrData.mmr, change);
        } else if (lastMMR === null) {
            console.log('📝 Premier enregistrement');
        } else {
            console.log('✅ Pas de changement');
        }

        console.log('\n✅ Tracker terminé avec succès');
        process.exit(0);

    } catch (error) {
        console.error('❌ Erreur fatale:', error);
        process.exit(1);
    }
})();

function getDivisionFromMMR(mmr) {
    const divisions = [
        { min: 1862, max: 2032, div: "I" }, // SSL (division unique mais gardée cohérente)

        // GC III
        { min: 1715, max: 1736, div: "I" },
        { min: 1744, max: 1775, div: "II" },
        { min: 1788, max: 1817, div: "III" },
        { min: 1832, max: 1857, div: "IV" },

        // GC II
        { min: 1575, max: 1597, div: "I" },
        { min: 1601, max: 1637, div: "II" },
        { min: 1646, max: 1660, div: "III" },
        { min: 1677, max: 1698, div: "IV" },

        // GC I
        { min: 1435, max: 1458, div: "I" },
        { min: 1462, max: 1495, div: "II" },
        { min: 1498, max: 1526, div: "III" },
        { min: 1537, max: 1559, div: "IV" },

        // Champion III
        { min: 1315, max: 1333, div: "I" },
        { min: 1335, max: 1367, div: "II" },
        { min: 1368, max: 1396, div: "III" },
        { min: 1402, max: 1419, div: "IV" },

        // Champion II
        { min: 1195, max: 1213, div: "I" },
        { min: 1215, max: 1247, div: "II" },
        { min: 1248, max: 1278, div: "III" },
        { min: 1282, max: 1299, div: "IV" },

        // Champion I
        { min: 1075, max: 1093, div: "I" },
        { min: 1094, max: 1127, div: "II" },
        { min: 1128, max: 1160, div: "III" },
        { min: 1162, max: 1180, div: "IV" },
    ];

    const found = divisions.find(d => mmr >= d.min && mmr <= d.max);
    return found ? `Division ${found.div}` : null;
}


