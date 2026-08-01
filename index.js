const axios = require('axios');
const xml2js = require('xml2js');
const cheerio = require('cheerio');
const admin = require('firebase-admin');

// GitHub Secrets থেকে ফায়ারবেস কী লোড করা
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

// ওয়েবসাইটের লিঙ্ক থেকে পুরো আর্টিকেল বা খবর স্ক্র্যাপ করার ফাংশন
async function fetchFullArticle(url, siteName) {
    try {
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 8000
        });
        const $ = cheerio.load(response.data);
        let articleText = '';

        if (siteName === 'prothomalo') {
            // প্রথমালোর আর্টিকেলের প্যারাগ্রাফ
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
            // সাধারণ যেকোনো সাইটের প্যারাগ্রাফ
            $('article p, p').each((i, el) => {
                articleText += $(el).text().trim() + '\n\n';
            });
        }

        return articleText.trim() || 'আর্টিকেল পাওয়া যায়নি বা স্ক্র্যাপ করা সম্ভব হয়নি।';
    } catch (error) {
        console.error(`Error fetching article from ${url}:`, error.message);
        return 'আর্টিকেল লোড করতে সমস্যা হয়েছে।';
    }
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

                // সময় বাঁচাতে প্রথম ১০টি সাম্প্রতিক খবর নেওয়া হচ্ছে (প্রয়োজনে সংখ্যা বাড়াতে পারেন)
                const recentItems = items.slice(0, 10); 
                const newsList = [];

                for (const item of recentItems) {
                    const title = item.title ? item.title[0] : '';
                    const link = item.link ? item.link[0] : '';
                    const published_at = item.pubDate ? item.pubDate[0] : '';

                    console.log(`[${siteName}] খবর লোড হচ্ছে: ${title}`);
                    
                    // পুরো খবর স্ক্র্যাপ করা
                    const content = await fetchFullArticle(link, siteName);

                    newsList.push({
                        title: title,
                        link: link,
                        published_at: published_at,
                        content: content, // এখানে পুরো খবর সেভ হবে
                        fetched_at: new Date().toLocaleString('en-US', { timeZone: 'Asia/Dhaka' })
                    });
                }

                // ফায়ারবেসে ডাটা আপডেট করা
                await db.ref(`news/${siteName}`).set(newsList);
                console.log(`[${siteName}] - সফলভাবে ${newsList.length}টি পুরো আর্টিকেল আপডেট হয়েছে!`);

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
