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
const ref = db.ref('prothomalo_news');

const RSS_URL = 'https://www.prothomalo.com/feed';
const parser = new xml2js.Parser();

async function runScraper() {
    try {
        const response = await axios.get(RSS_URL);
        const result = await parser.parseStringPromise(response.data);
        const items = result.rss.channel[0].item;

        const newsList = items.map(item => ({
            title: item.title ? item.title[0] : '',
            link: item.link ? item.link[0] : '',
            published_at: item.pubDate ? item.pubDate[0] : '',
            fetched_at: new Date().toLocaleString()
        }));

        // ক্লাউড ফায়ারবেসে নিউজ সেট করা
        await ref.set(newsList);
        console.log(`সফলভাবে ${newsList.length}টি খবর Firebase-এ আপডেট হয়েছে!`);
        process.exit(0);

    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

runScraper();
