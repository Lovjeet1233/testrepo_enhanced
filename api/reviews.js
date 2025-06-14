const gplay = require('google-play-scraper');
const store = require('app-store-scraper');

// Simple cache to avoid rate limits
let cache = null;
let cacheTime = 0;
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

// App IDs
const MEESHO_PLAY = 'com.meesho.supply';
const MEESHO_APP = { id: 1457958492, country: 'in' };
const CRED_PLAY = 'com.dreamplug.androidapp';
const CRED_APP = { id: 1343011398, country: 'in' };

// Get Play Store reviews
async function getPlayStoreReviews(appId, appName, count = 20) {
  try {
    const reviews = await gplay.reviews({
      appId: appId,
      sort: gplay.sort.NEWEST,
      num: count,
      lang: 'en',
      country: 'in'
    });

    return reviews.data.map(review => ({
      app: appName,
      store: 'Google Play Store',
      username: review.userName || 'Anonymous',
      rating: review.score || 0,
      review: review.text || '',
      date: review.date ? new Date(review.date).toISOString() : null,
      version: review.version || null,
      thumbsUp: review.thumbsUp || 0
    }));
  } catch (error) {
    console.error(`Play Store error for ${appName}:`, error.message);
    return [];
  }
}

// Get App Store reviews
async function getAppStoreReviews(appConfig, appName, count = 20) {
  try {
    const reviews = await store.reviews({
      id: appConfig.id,
      country: appConfig.country,
      sort: store.sort.MOST_RECENT,
      page: 1,
      count: count
    });

    return reviews.map(review => ({
      app: appName,
      store: 'Apple App Store',
      username: review.userName || 'Anonymous',
      rating: review.score || 0,
      review: review.text || '',
      date: review.updated ? new Date(review.updated).toISOString() : null,
      version: review.version || null,
      thumbsUp: 0
    }));
  } catch (error) {
    console.error(`App Store error for ${appName}:`, error.message);
    return [];
  }
}

// Main function to get all reviews
async function getAllReviews() {
  const now = Date.now();
  
  // Return cached data if available
  if (cache && (now - cacheTime) < CACHE_DURATION) {
    return cache;
  }

  console.log('Fetching fresh reviews...');
  
  const allReviews = [];

  // Get reviews from all sources
  const [
    meeshoPlay,
    meeshoApp,
    credPlay,
    credApp
  ] = await Promise.all([
    getPlayStoreReviews(MEESHO_PLAY, 'Meesho', 20),
    getAppStoreReviews(MEESHO_APP, 'Meesho', 20),
    getPlayStoreReviews(CRED_PLAY, 'CRED', 20),
    getAppStoreReviews(CRED_APP, 'CRED', 20)
  ]);

  // Combine all reviews
  allReviews.push(...meeshoPlay, ...meeshoApp, ...credPlay, ...credApp);

  // Sort by rating and date
  const sortedReviews = allReviews
    .filter(review => review.review && review.review.length > 10) // Filter out empty reviews
    .sort((a, b) => {
      if (b.rating !== a.rating) return b.rating - a.rating; // Higher rating first
      return new Date(b.date) - new Date(a.date); // More recent first
    })
    .slice(0, 75); // Limit to 75 reviews

  const result = {
    success: true,
    total: sortedReviews.length,
    apps: ['Meesho', 'CRED'],
    stores: ['Google Play Store', 'Apple App Store'],
    lastUpdated: new Date().toISOString(),
    reviews: sortedReviews
  };

  // Cache the result
  cache = result;
  cacheTime = now;

  return result;
}

// For Vercel serverless function
module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const reviews = await getAllReviews();
    res.status(200).json(reviews);
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch reviews',
      message: error.message
    });
  }
};

// For local testing
if (require.main === module) {
  getAllReviews().then(result => {
    console.log(`✅ Got ${result.total} reviews`);
    console.log(JSON.stringify(result, null, 2));
  }).catch(console.error);
}