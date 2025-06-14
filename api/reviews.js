const gplay = require('google-play-scraper');
const store = require('app-store-scraper');

// Simple cache to avoid rate limits
let cache = null;
let cacheTime = 0;
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

// App configurations
const APPS = {
  meesho: {
    playStore: 'com.meesho.supply',
    appStore: { id: 1457958492, country: 'in' },
    name: 'Meesho'
  },
  cred: {
    playStore: 'com.dreamplug.androidapp',
    appStore: { id: 1343011398, country: 'in' },
    name: 'CRED'
  }
};

// Get Play Store reviews
async function getPlayStoreReviews(appId, appName, count = 18) {
  try {
    console.log(`Fetching Play Store reviews for ${appName}...`);
    
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
      thumbsUp: review.thumbsUp || 0,
      reviewId: review.id || null
    }));
  } catch (error) {
    console.error(`Play Store error for ${appName}:`, error.message);
    return [];
  }
}

// Get App Store reviews
async function getAppStoreReviews(appConfig, appName, count = 18) {
  try {
    console.log(`Fetching App Store reviews for ${appName}...`);
    
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
      thumbsUp: 0,
      reviewId: review.id || null
    }));
  } catch (error) {
    console.error(`App Store error for ${appName}:`, error.message);
    return [];
  }
}

// Main function to get all reviews
async function getAllReviews() {
  const now = Date.now();
  
  // Return cached data if available and not expired
  if (cache && (now - cacheTime) < CACHE_DURATION) {
    console.log('Returning cached data');
    return cache;
  }

  console.log('Fetching fresh reviews from both stores...');
  
  try {
    // Fetch reviews from all sources with error handling
    const reviewPromises = [
      getPlayStoreReviews(APPS.meesho.playStore, APPS.meesho.name, 18),
      getAppStoreReviews(APPS.meesho.appStore, APPS.meesho.name, 18),
      getPlayStoreReviews(APPS.cred.playStore, APPS.cred.name, 18),
      getAppStoreReviews(APPS.cred.appStore, APPS.cred.name, 18)
    ];

    const [meeshoPlay, meeshoApp, credPlay, credApp] = await Promise.all(reviewPromises);

    // Combine all reviews
    const allReviews = [...meeshoPlay, ...meeshoApp, ...credPlay, ...credApp];

    // Filter and sort reviews
    const filteredReviews = allReviews
      .filter(review => review && review.review && review.review.length > 5)
      .sort((a, b) => {
        // Sort by rating first, then by date
        if (b.rating !== a.rating) return b.rating - a.rating;
        return new Date(b.date || 0) - new Date(a.date || 0);
      })
      .slice(0, 75);

    const result = {
      success: true,
      total: filteredReviews.length,
      apps: ['Meesho', 'CRED'],
      stores: ['Google Play Store', 'Apple App Store'],
      lastUpdated: new Date().toISOString(),
      cacheExpiresAt: new Date(now + CACHE_DURATION).toISOString(),
      reviews: filteredReviews
    };

    // Update cache
    cache = result;
    cacheTime = now;

    console.log(`✅ Successfully fetched ${filteredReviews.length} reviews`);
    return result;

  } catch (error) {
    console.error('Error fetching reviews:', error);
    
    // Return cached data if available, even if expired
    if (cache) {
      console.log('Returning stale cached data due to error');
      return { ...cache, stale: true, error: 'Using cached data due to fetch error' };
    }
    
    throw error;
  }
}

// Vercel serverless function handler
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ 
      success: false,
      error: 'Method not allowed',
      message: 'Only GET requests are supported'
    });
  }

  try {
    console.log('🚀 API request received');
    
    const reviews = await getAllReviews();
    
    console.log(`📊 Returning ${reviews.total} reviews`);
    res.status(200).json(reviews);

  } catch (error) {
    console.error('💥 API Handler Error:', error);
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to fetch reviews from app stores',
      timestamp: new Date().toISOString(),
      // Include error details in development
      ...(process.env.NODE_ENV === 'development' && { details: error.message })
    });
  }
}