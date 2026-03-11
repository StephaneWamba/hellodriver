import fastifyJwt from '@fastify/jwt';
import Fastify from 'fastify';

const testSecret = 'dSS69wOz2HN1l/XGuyg2xejB5Rcexm4TDsNpIPl8Ih2sWwZr0hZZxGs3FxK0VOteXWa9lSEd3RW9UYBpnLJF4Q==';
const secretBuffer = Buffer.from(testSecret, 'base64');

// Known valid token from test above
const validToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1NTBlODQwMC1lMjliLTQxZDQtYTcxNi00NDY2NTU0NDAwMDAiLCJlbWFpbCI6InRlc3RAbG9jYWwiLCJyb2xlIjoiY2xpZW50IiwiYXVkIjoiYXV0aGVudGljYXRlZCIsImV4cCI6MTc3MzIyMjk2OCwiaWF0IjoxNzczMjE5MzY4fQ.VNRYT4H3ovbN_yUf2T22JkalhTMTLK3i_chdBD-lSDw';

async function test() {
  const app = Fastify();
  
  // Register JWT with the same secret
  await app.register(fastifyJwt, {
    secret: secretBuffer,
    sign: { algorithm: 'HS256' },
    verify: { algorithms: ['HS256'] },
  });

  console.log('=== @fastify/jwt Verification Test ===\n');
  console.log('Testing token verification with @fastify/jwt...\n');
  
  // Create a test route that verifies the token
  app.post('/test-verify', async (request, reply) => {
    try {
      await request.jwtVerify();
      return { success: true, user: request.user };
    } catch (err) {
      return reply.code(401).send({ success: false, error: err.message });
    }
  });

  // Simulate a request with the token
  const res = await app.inject({
    method: 'POST',
    url: '/test-verify',
    headers: { authorization: `Bearer ${validToken}` },
  });

  console.log(`Response Status: ${res.statusCode}`);
  console.log(`Response Body: ${res.payload}\n`);

  if (res.statusCode === 200) {
    console.log('✓ JWT VERIFICATION SUCCESS - Token is valid!');
  } else {
    console.log('✗ JWT VERIFICATION FAILED');
  }
  
  await app.close();
}

test().catch(console.error);
