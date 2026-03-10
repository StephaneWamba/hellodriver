#!/usr/bin/env node

/**
 * Test Cloudflare API token and Account ID
 * Usage: node scripts/test-cloudflare.js
 */

const apiToken = process.env.CLOUDFLARE_API_TOKEN;
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;

if (!apiToken || !accountId) {
  console.error('❌ Missing credentials:');
  if (!apiToken) console.error('  - CLOUDFLARE_API_TOKEN');
  if (!accountId) console.error('  - CLOUDFLARE_ACCOUNT_ID');
  process.exit(1);
}

console.log('🔍 Testing Cloudflare credentials...\n');

(async () => {
  try {
    // Test 1: Verify API token
    console.log('1️⃣  Verifying API token...');
    let response = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`API token verification failed: ${response.status} ${response.statusText}`);
    }

    const tokenData = await response.json();
    if (!tokenData.success) {
      throw new Error(`Token error: ${tokenData.errors?.[0]?.message || 'Unknown error'}`);
    }

    console.log('   ✅ API token is valid');
    console.log(`   Status: ${tokenData.result?.status}`);
    if (tokenData.result?.permissions) {
      console.log(`   Permissions: ${tokenData.result.permissions.join(', ')}`);
    }

    // Test 2: Verify Account ID
    console.log('\n2️⃣  Verifying Account ID...');
    response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Account verification failed: ${response.status} ${response.statusText}`);
    }

    const accountData = await response.json();
    if (!accountData.success) {
      throw new Error(`Account error: ${accountData.errors?.[0]?.message || 'Unknown error'}`);
    }

    console.log('   ✅ Account ID is valid');
    console.log(`   Account: ${accountData.result?.name}`);
    console.log(`   Plan: ${accountData.result?.plan?.name}`);

    // Test 3: List Pages projects
    console.log('\n3️⃣  Listing Cloudflare Pages projects...');
    response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Pages projects request failed: ${response.status} ${response.statusText}`);
    }

    const projectsData = await response.json();
    if (!projectsData.success) {
      console.warn(`   ⚠️  Could not list projects: ${projectsData.errors?.[0]?.message}`);
    } else {
      const projects = projectsData.result || [];
      if (projects.length > 0) {
        console.log(`   ✅ Found ${projects.length} project(s):`);
        projects.forEach(p => console.log(`      - ${p.name}`));
      } else {
        console.log('   ℹ️  No Pages projects found (this is okay)');
      }
    }

    console.log('\n✅ All credentials verified successfully!\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
})();
