const axios = require('axios');
const xml2js = require('xml2js');
const cheerio = require('cheerio');
const admin = require('firebase-admin');
const crypto = require('crypto');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

const db = admin.database();
const parser = new xml2js.Parser();

const RSS_FEEDS = {
    prothomalo: 'https://www.prothomalo.com/feed',
    jagonews24: 'https://www.jagonews24.com/rss/rss.xml',
    bdnews24: 'https://bangla.bdnews24.com/rss',
    dailystar: 'https://www.thedailystar.net/frontpage/rss.xml',
    jugantor: 'https://www.jugantor.com/feed/rss.xml',
    ittefaq: 'https://www.ittefaq.com.bd/rss.xml',
    kalbela: 'https://www.kalbela.com/rss.xml',
    somoynews: 'https://www.somoynews.tv/rss.xml',
    dhakatribune: 'https://www.dhakatribune.com/articles/bangladesh/rss.xml',
    bonikbarta: 'https://bonikbarta.net/rss.xml',
    kalerkantho: 'https://www.kalerkantho.com/rss.xml',
    bdprotidin: 'https://www.bd-pratidin.com/rss.xml',
    risingbd: 'https://www.risingbd.com/rss/rss.xml'
};

const AXIOS_CONFIG = {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Cache-Control': 'no-cache'
    },
    timeout: 15000
};

async function fetchFullArticle(url, siteName) {
    try {
        const response = await axios.get(url, AXIOS_CONFIG);
        const $ = cheerio.load(response.data);
        let articleText = '';

        $('article p, .story-element-text p, .story-content p, .field-name-body p, p').each((i, el) => {
            const text = $(el).text().trim();
            if (text.length > 25) {
                articleText += text + '\n\n';
            }
        });

        return articleText.trim() || 'আর্টিকেল ডেসক্রিপশন পাওয়া যায়নি।';
    } catch (error) {
        return 'আর্টিকেল লোড করতে সমস্যা হয়েছে।';
    }
}

function generateHash(text) {
    return crypto.createHash('md5').update(text).digest('hex');
}

async function runScraper() {
    try {
        for (const [siteName, url] of Object.entries(RSS_FEEDS)) {
            try {
                const response = await axios.get(url, AXIOS_CONFIG);
                const result = await parser.parseStringPromise(response.data);
                
                const channel = result.rss?.channel?.[0] || result.feed;
                const items = channel?.item || channel?.entry || [];
                
                const recentItems = items.slice(0, 5); 
                let newArticlesCount = 0;

                for (const item of recentItems) {
                    const title = item.title ? (typeof item.title[0] === 'string' ? item.title[0] : item.title[0]._ || '') : '';
                    let link = '';
                    
                    if (item.link) {
                        link = typeof item.link[0] === 'string' ? item.link[0] : (item.link[0].$.href || '');
                    }

                    const published_at = item.pubDate ? item.pubDate[0] : (item.updated ? item.updated[0] : '');

                    if (!link || !title) continue;

                    const articleId = generateHash(link);
                    const articleRef = db.ref(`news/${siteName}/${articleId}`);

                    const snapshot = await articleRef.once('value');
                    if (!snapshot.exists()) {
                        console.log(`[${siteName}] নতুন খবর লোড হচ্ছে: ${title}`);
                        
                        const content = await fetchFullArticle(link, siteName);

                        await articleRef.set({
                            title: title,
                            link: link,
                            published_at: published_at,
                            content: content,
                            fetched_at: new Date().toLocaleString('en-US', { timeZone: 'Asia/Dhaka' })
                        });
                        newArticlesCount++;
                    }
                }

                console.log(`[${siteName}] - ${newArticlesCount}টি নতুন খবর সেভ করা হয়েছে!`);

            } catch (siteError) {
                console.error(`[${siteName}] স্ক্র্যাপ করতে সমস্যা হয়েছে: ${siteError.message}`);
            }
        }

        process.exit(0);

    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

runScraper();                        });
                        newArticlesCount++;
                    }
                }

                console.log(`[${siteName}] - ${newArticlesCount}টি নতুন খবর সেভ করা হয়েছে!`);

            } catch (siteError) {
                console.error(`[${siteName}] স্ক্র্যাপ করতে সমস্যা হয়েছে: ${siteError.message}`);
            }
        }

        process.exit(0);

    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

runScraper();                        });
                        newArticlesCount++;
                    }
                }

                console.log(`[${siteName}] - ${newArticlesCount}টি নতুন খবর সেভ করা হয়েছে!`);

            } catch (siteError) {
                console.error(`[${siteName}] স্ক্র্যাপ করতে সমস্যা হয়েছে:`, siteError.message);
            }
        }

        process.exit(0);

    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

runScraper();
