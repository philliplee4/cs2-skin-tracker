const API_URL = 'http://localhost:3001/api';

// Check if user is logged in, redirect to login if not
async function checkAuth() {
  try {
    const res = await fetch(API_URL + '/me', { credentials: 'include' });
    if (!res.ok) {
      window.location.href = 'login.html';
      return null;
    }
    const data = await res.json();
    return data.user;
  } catch (err) {
    window.location.href = 'login.html';
    return null;
  }
}

// API helper for making authenticated requests
async function apiRequest(endpoint, options = {}) {
  const res = await fetch(API_URL + endpoint, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
}