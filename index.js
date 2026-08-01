const axios = require('axios');
const xml2js = require('xml2js');
const admin = require('firebase-admin');

// GitHub Secrets থেকে ফায়ারবেস কী (Key) লোড করবে
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

const db = admin.database();
const parser = new xml2js.Parser();

// যে যে ওয়েবসাইটের খবর আপনি সংগ্রাহ করতে চান সেগুলোর RSS Feed লিংক
const RSS_FEEDS = {
    prothomalo: 'https://www.prothomalo.com/feed',
    bdnews24: 'https://bangla.bdnews24.com/rss',
    dailystar: 'https://www.thedailystar.net/rss'
};

async function runScraper() {
    try {
        // প্রতিটি সাইটের জন্য লুপ চলবে
        for (const [siteName, url] of Object.entries(RSS_FEEDS)) {
            try {
                const response = await axios.get(url, {
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    timeout: 10000
                });
                
                const result = await parser.parseStringPromise(response.data);
                const items = result.rss.channel[0].item || [];

                const newsList = items.map(item => ({
                    title: item.title ? item.title[0] : '',
                    link: item.link ? item.link[0] : '',
                    published_at: item.pubDate ? item.pubDate[0] : '',
                    fetched_at: new Date().toLocaleString('en-US', { timeZone: 'Asia/Dhaka' })
                }));

                // ফায়ারবেসের 'news/siteName' পাথে সেভ হবে (যেমন: news/prothomalo)
                await db.ref(`news/${siteName}`).set(newsList);
                console.log(`[${siteName}] - সফলভাবে ${newsList.length}টি খবর আপডেট হয়েছে!`);

            } catch (siteError) {
                // কোনো একটা সাইটে সমস্যা হলে যাতে বাকিগুলোর কাজ বন্ধ না হয়ে যায়
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
