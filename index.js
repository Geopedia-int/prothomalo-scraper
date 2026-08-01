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
    bdnews24: 'https://bangla.bdnews24.com/rss',
    dailystar: 'https://www.thedailystar.net/rss'
};

async function fetchFullArticle(url, siteName) {
    try {
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 8000
        });
        const $ = cheerio.load(response.data);
        let articleText = '';

        if (siteName === 'prothomalo') {
            $('.story-element-text p, .story-content p, article p').each((i, el) => {
                articleText += $(el).text().trim() + '\n\n';
            });
        } else if (siteName === 'bdnews24') {
            $('article p, .custom-story-content p').each((i, el) => {
                articleText += $(el).text().trim() + '\n\n';
            });
        } else if (siteName === 'dailystar') {
            $('.field-name-body p, article p').each((i, el) => {
                articleText += $(el).text().trim() + '\n\n';
            });
        } else {
            $('article p, p').each((i, el) => {
                articleText += $(el).text().trim() + '\n\n';
            });
        }

        return articleText.trim() || 'আর্টিকেল পাওয়া যায়নি বা স্ক্র্যাপ করা সম্ভব হয়নি।';
    } catch (error) {
        return 'আর্টিকেল লোড করতে সমস্যা হয়েছে।';
    }
}

// লিঙ্কের ওপর ভিত্তি করে ইউনিক আইডি তৈরি করার ফাংশন (ডুপ্লিকেট রোখার জন্য)
function generateHash(text) {
    return crypto.createHash('md5').update(text).digest('hex');
}

async function runScraper() {
    try {
        for (const [siteName, url] of Object.entries(RSS_FEEDS)) {
            try {
                const response = await axios.get(url, {
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    timeout: 10000
                });
                
                const result = await parser.parseStringPromise(response.data);
                const items = result.rss.channel[0].item || [];
                const recentItems = items.slice(0, 10);

                let newArticlesCount = 0;

                for (const item of recentItems) {
                    const title = item.title ? item.title[0] : '';
                    const link = item.link ? item.link[0] : '';
                    const published_at = item.pubDate ? item.pubDate[0] : '';

                    if (!link) continue;

                    // লিঙ্কের হ্যাশ দিয়ে ইউনিক আইডি বানিয়ে চেক করা
                    const articleId = generateHash(link);
                    const articleRef = db.ref(`news/${siteName}/${articleId}`);

                    // চেক করা হচ্ছে খবরটি আগে থেকেই ফায়ারবেসে সেভ আছে কি না
                    const snapshot = await articleRef.once('value');
                    if (!snapshot.exists()) {
                        console.log(`[${siteName}] নতুন খবর পাওয়া গেছে: ${title}`);
                        
                        const content = await fetchFullArticle(link, siteName);

                        // শুধু নতুন খবরটি ডাটাবেজে সেভ হবে
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
                console.error(`[${siteName}] সমস্যা:`, siteError.message);
            }
        }

        process.exit(0);

    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

runScraper();
