const { redis, isRedisAvailable } = require('./config/redis');

(async () => {

  console.log('Redis ready:', isRedisAvailable());

  await redis.set('test:key', 'trebetta');

  const value = await redis.get('test:key');

  console.log('Value:', value);

  process.exit();

})();