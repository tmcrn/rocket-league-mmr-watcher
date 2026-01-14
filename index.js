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


    const progress = getRankProgressFromMMR(newMMR);
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
                value: `${progress.nextRank} dans ${progress.mmrToNextRank} MMR`,
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

function getRankProgressFromMMR(mmr) {
    const ladder = [
        { min: 0,    name: "Bronze I", div: "I" },
        { min: 168,  name: "Bronze II", div: "I" },
        { min: 229,  name: "Bronze III", div: "I" },

        { min: 294,  name: "Silver I", div: "I" },
        { min: 354,  name: "Silver II", div: "I" },
        { min: 415,  name: "Silver III", div: "I" },

        { min: 474,  name: "Gold I", div: "I" },
        { min: 534,  name: "Gold II", div: "I" },
        { min: 593,  name: "Gold III", div: "I" },

        { min: 644,  name: "Platinum I", div: "I" },
        { min: 712,  name: "Platinum II", div: "I" },
        { min: 772,  name: "Platinum III", div: "I" },

        { min: 833,  name: "Diamond I", div: "I" },
        { min: 915,  name: "Diamond II", div: "I" },
        { min: 995,  name: "Diamond III", div: "I" },

        { min: 1075, name: "Champion I", div: "I" },
        { min: 1195, name: "Champion II", div: "I" },
        { min: 1315, name: "Champion III", div: "I" },

        { min: 1435, name: "Grand Champion I", div: "I" },
        { min: 1575, name: "Grand Champion II", div: "I" },
        { min: 1715, name: "Grand Champion III", div: "I" },

        { min: 1862, name: "Supersonic Legend", div: null },
    ];

    let current = ladder[0];
    let next = null;

    for (let i = 0; i < ladder.length; i++) {
        if (mmr >= ladder[i].min) {
            current = ladder[i];
            next = ladder[i + 1] || null;
        }
    }

    return {
        currentRank: current.name,
        nextRank: next ? next.name : null,
        mmrToNextRank: next ? next.min - mmr : 0
    };
}




