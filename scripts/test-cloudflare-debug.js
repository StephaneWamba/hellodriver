#!/usr/bin/env node

const apiToken = process.env.CLOUDFLARE_API_TOKEN;

if (!apiToken) {
  console.error('❌ CLOUDFLARE_API_TOKEN not set');
  process.exit(1);
}

(async () => {
  try {
    // Get token info including which account it's tied to
    const response = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    console.log('Token Verification Response:');
    console.log(JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
  }
})();
