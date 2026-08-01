const axios = require('axios');
const xml2js = require('xml2js');
const cheerio = require('cheerio');
const admin = require('firebase-admin');
const crypto = require('crypto');

// GitHub Secrets থেকে ফায়ারবেস কী লোড করা
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

const db = admin.database();
const parser = new xml2js.Parser();

// বাংলাদেশের ১৫টি শীর্ষস্থানীয় পত্রিকার RSS Feed
const RSS_FEEDS = {
    bdprotidin: 'https://www.bd-pratidin.com/rss.xml',       // বাংলাদেশ প্রতিদিন
    prothomalo: 'https://www.prothomalo.com/feed',            // প্রথম আলো
    bdnews24: 'https://bangla.bdnews24.com/rss',              // বিডিনিউজ২৪
    dailystar: 'https://www.thedailystar.net/rss',            // ডেইলি স্টার
    jagonews24: 'https://www.jagonews24.com/rss/rss.xml',    // জাগো নিউজ ২৪
    jugantor: 'https://www.jugantor.com/feed',                // যুগান্তর
    ittefaq: 'https://www.ittefaq.com.bd/feed',               // ইত্তেফাক
    kalbela: 'https://www.kalbela.com/feed',                  // কালবেলা
    somoynews: 'https://www.somoynews.tv/rss.xml',            // সময় নিউজ
    independent24: 'https://www.independent24.com/rss.xml',   // ইনডিপেনডেন্ট টিভি
    dhakatribune: 'https://www.dhakatribune.com/rss.xml',     // ঢাকা ট্রিবিউন
    bonikbarta: 'https://bonikbarta.net/feed',                // বণিক বার্তা
    kalerkantho: 'https://www.kalerkantho.com/rss.xml',       // কালের কণ্ঠ
    risingbd: 'https://www.risingbd.com/rss.xml',             // রাইজিংবিডি
    prothomalobangla: 'https://www.prothomalo.com/feed/bangla' // প্রথম আলো বাংলা
};

// আর্টিকেলের লিঙ্ক থেকে পুরো লেখা নিয়ে আসার ফাংশন
async function fetchFullArticle(url, siteName) {
    try {
        const response = await axios.get(url, {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
            },
            timeout: 8000
        });
        const $ = cheerio.load(response.data);
        let articleText = '';

        // সাধারণ প্যারাগ্রাফ স্ক্র্যাপ করা
        $('article p, .story-element-text p, .story-content p, .field-name-body p, p').each((i, el) => {
            const text = $(el).text().trim();
            if (text.length > 20) { // খুব ছোট বা অপ্রয়োজনীয় টেক্সট বাদ দেওয়া
                articleText += text + '\n\n';
            }
        });

        return articleText.trim() || 'আর্টিকেল ডেসক্রিপশন পাওয়া যায়নি।';
    } catch (error) {
        return 'আর্টিকেল লোড করতে সমস্যা হয়েছে।';
    }
}

// ইউনিক আইডি বানানোর ফাংশন (ডুপ্লিকেট রোখার জন্য)
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
                const items = result.rss?.channel?.[0]?.item || [];
                
                // সময় ও সার্ভার লোড নিয়ন্ত্রণে রাখতে প্রতি সাইটের সাম্প্রতিক ৫টি খবর স্ক্র্যাপ হবে
                const recentItems = items.slice(0, 5); 
                let newArticlesCount = 0;

                for (const item of recentItems) {
                    const title = item.title ? item.title[0] : '';
                    const link = item.link ? item.link[0] : '';
                    const published_at = item.pubDate ? item.pubDate[0] : '';

                    if (!link) continue;

                    // লিঙ্কের হ্যাশ দিয়ে ইউনিক আইডি বানিয়ে চেক করা
                    const articleId = generateHash(link);
                    const articleRef = db.ref(`news/${siteName}/${articleId}`);

                    // পূর্বে ফায়ারবেসে সেভ করা আছে কি না চেক করা
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
