const puppeteer = require('puppeteer');
const fs = require('fs').promises;

const DATA_FILE = 'mmr-history.json';
const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK;

const getRocketLeagueRating = async () => {
    let browser;
    try {
        browser = await puppeteer.launch({
            executablePath: '/usr/bin/chromium',
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
        });

        const page = await browser.newPage();

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => false,
            });
        });

        console.log('Navigation vers Tracker.gg...');
        await page.goto('https://tracker.gg/rocket-league/profile/psn/Snowthy/overview', {
            waitUntil: 'networkidle0',
            timeout: 60000
        });

        console.log('Attente du chargement...');
        await new Promise(resolve => setTimeout(resolve, 4000));

        console.log('Scroll...');
        await page.evaluate(() => window.scrollTo(0, 500));
        await new Promise(resolve => setTimeout(resolve, 2000));

        await page.evaluate(() => window.scrollTo(0, 1000));
        await new Promise(resolve => setTimeout(resolve, 2000));

        console.log('Recherche du MMR...');
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

function getRankImage(rankName) {
    const rankImages = {
        "Bronze I": "https://raw.githubusercontent.com/tmcrn/rocket-league-mmr-watcher/master/logoRank/Bronze%20I.webp",
        "Bronze II": "https://raw.githubusercontent.com/tmcrn/rocket-league-mmr-watcher/master/logoRank/Bronze%20II.webp",
        "Bronze III": "https://raw.githubusercontent.com/tmcrn/rocket-league-mmr-watcher/master/logoRank/Bronze%20III.webp",

        "Silver I": "https://raw.githubusercontent.com/tmcrn/rocket-league-mmr-watcher/master/logoRank/Silver%20I.webp",
        "Silver II": "https://raw.githubusercontent.com/tmcrn/rocket-league-mmr-watcher/master/logoRank/Silver%20II.webp",
        "Silver III": "https://raw.githubusercontent.com/tmcrn/rocket-league-mmr-watcher/master/logoRank/Silver%20III.webp",

        "Gold I": "https://raw.githubusercontent.com/tmcrn/rocket-league-mmr-watcher/master/logoRank/Gold%20I.webp",
        "Gold II": "https://raw.githubusercontent.com/tmcrn/rocket-league-mmr-watcher/master/logoRank/Gold%20II.webp",
        "Gold III": "https://raw.githubusercontent.com/tmcrn/rocket-league-mmr-watcher/master/logoRank/Gold%20III.webp",

        "Platinum I": "https://raw.githubusercontent.com/tmcrn/rocket-league-mmr-watcher/master/logoRank/Platinum%20I.webp",
        "Platinum II": "https://raw.githubusercontent.com/tmcrn/rocket-league-mmr-watcher/master/logoRank/Platinum%20II.webp",
        "Platinum III": "https://raw.githubusercontent.com/tmcrn/rocket-league-mmr-watcher/master/logoRank/Platinum%20III.webp",

        "Diamond I": "https://raw.githubusercontent.com/tmcrn/rocket-league-mmr-watcher/master/logoRank/Diamond%20I.webp",
        "Diamond II": "https://raw.githubusercontent.com/tmcrn/rocket-league-mmr-watcher/master/logoRank/Diamond%20II.webp",
        "Diamond III": "https://raw.githubusercontent.com/tmcrn/rocket-league-mmr-watcher/master/logoRank/Diamond%20III.webp",

        "Champion I": "https://raw.githubusercontent.com/tmcrn/rocket-league-mmr-watcher/master/logoRank/Champion%20I.webp",
        "Champion II": "https://raw.githubusercontent.com/tmcrn/rocket-league-mmr-watcher/master/logoRank/Champion%20II.webp",
        "Champion III": "https://raw.githubusercontent.com/tmcrn/rocket-league-mmr-watcher/master/logoRank/Champion%20III.webp",

        "Grand Champion I": "https://raw.githubusercontent.com/tmcrn/rocket-league-mmr-watcher/master/logoRank/Grand%20Champion%20I.png",
        "Grand Champion II": "https://raw.githubusercontent.com/tmcrn/rocket-league-mmr-watcher/master/logoRank/Grand%20Champion%20II.webp",
        "Grand Champion III": "https://raw.githubusercontent.com/tmcrn/rocket-league-mmr-watcher/master/logoRank/Grand%20Champion%20III.png",

        "Supersonic Legend": "https://raw.githubusercontent.com/tmcrn/rocket-league-mmr-watcher/master/logoRank/SSL.webp",

        "Unranked": "https://raw.githubusercontent.com/tmcrn/rocket-league-mmr-watcher/master/logoRank/Unranked.png"
    };

    return rankImages[rankName] || rankImages["Unranked"];
}

const sendDiscordNotification = async (oldMMR, newMMR, change) => {
    if (!DISCORD_WEBHOOK) {
        console.log('❌ Pas de webhook Discord configuré');
        return;
    }

    const progress = getRankProgressFromMMR(newMMR);
    const emoji = change > 0 ? '📈' : '📉';
    const color = change > 0 ? 3066993 : 15158332;

    // Construction de la description principale
    let description = `${emoji} **${progress.currentRank}** | **${newMMR} MMR** | **${change > 0 ? '+' : ''}${change}**\n\n`;

    // Ajout de l'objectif
    if (progress.nextRank !== "SSL! 🏆") {
        description += `**Objectif :**\n`;
        description += `**${progress.nextRank}** : **${progress.mmrToNextRank} MMR** | ~**${progress.countGame} game${progress.countGame > 1 ? 's' : ''}**`;
    } else {
        description += `👑 **SUPERSONIC LEGEND** - Tu es au rang maximum !`;
    }

    const embed = {
        title: '🏆 Ranked Doubles 2v2',
        description: description,
        color: color,
        thumbnail: {
            url: getRankImage(progress.currentRank)
        },
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
            console.log('Création du fichier historique');
        }

        const entry = {
            timestamp: new Date().toISOString(),
            mmr: mmrData.mmr,
            mmrFormatted: mmrData.mmrFormatted
        };

        if (history.entries.length > 0 && history.entries[history.entries.length - 1].mmr === mmrData.mmr) {
            history.entries[history.entries.length - 1].timestamp = entry.timestamp;
            console.log('📝 Mise à jour du timestamp (MMR inchangé)');
        } else {
            history.entries.push(entry);
            console.log('📝 Nouvelle entrée ajoutée (MMR modifié)');
        }

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
        console.log('Pas d\'historique précédent');
    }
    return null;
}

function getRankProgressFromMMR(mmr) {
    const ladder = [
        { min: 0,    name: "Bronze I" },
        { min: 168,  name: "Bronze II" },
        { min: 229,  name: "Bronze III" },

        { min: 294,  name: "Silver I" },
        { min: 354,  name: "Silver II" },
        { min: 415,  name: "Silver III" },

        { min: 474,  name: "Gold I" },
        { min: 534,  name: "Gold II" },
        { min: 593,  name: "Gold III" },

        { min: 644,  name: "Platinum I" },
        { min: 712,  name: "Platinum II" },
        { min: 772,  name: "Platinum III" },

        { min: 833,  name: "Diamond I" },
        { min: 915,  name: "Diamond II" },
        { min: 995,  name: "Diamond III" },

        { min: 1075, name: "Champion I" },
        { min: 1195, name: "Champion II" },
        { min: 1315, name: "Champion III" },

        { min: 1435, name: "Grand Champion I" },
        { min: 1575, name: "Grand Champion II" },
        { min: 1715, name: "Grand Champion III" },

        { min: 1862, name: "Supersonic Legend" },
    ];

    let current = ladder[0];
    let next = null;

    for (let i = 0; i < ladder.length; i++) {
        if (mmr >= ladder[i].min) {
            current = ladder[i];
            next = ladder[i + 1] || null;
        }
    }

    const mmrToNextRank = next ? next.min - mmr : 0;
    const countGame = Math.ceil(mmrToNextRank / 9);

    return {
        currentRank: current.name,
        nextRank: next ? next.name : "SSL! 🏆",
        mmrToNextRank: mmrToNextRank,
        countGame: countGame
    };
}

// Main
(async () => {
    try {
        console.log('Lancement du tracker MMR...\n');

        const mmrData = await getRocketLeagueRating();

        if (!mmrData || !mmrData.found) {
            console.error('❌ Impossible de récupérer le MMR');
            process.exit(1);
        }

        console.log(`\nMMR actuel: ${mmrData.mmrFormatted} (${mmrData.mmr})`);

        const lastMMR = await getLastMMR();
        await saveMMRData(mmrData);

        if (lastMMR !== null && lastMMR !== mmrData.mmr) {
            const change = mmrData.mmr - lastMMR;
            console.log(`Changement détecté: ${change > 0 ? '+' : ''}${change}`);
            await sendDiscordNotification(lastMMR, mmrData.mmr, change);
        } else if (lastMMR === null) {
            console.log('Premier enregistrement');
        } else {
            console.log('Pas de changement');
        }

        console.log('\nTracker terminé avec succès');
        process.exit(0);

    } catch (error) {
        console.error('❌ Erreur fatale:', error);
        process.exit(1);
    }
})();
