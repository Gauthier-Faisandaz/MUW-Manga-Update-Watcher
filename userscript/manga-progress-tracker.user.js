// ==UserScript==
// @name         Manga Progress Tracker (mangaread.org) + Save Button
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Track manga chapters read on mangaread.org and sync to n8n webhook + Save Manga button
// @match        https://www.mangaread.org/manga/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// ==/UserScript==
(function() {
  'use strict';

  // ===== CONFIGURATION =====
  // Replace with your own n8n instance and webhook paths (see workflows/Webhook_URL_Monitor.json):
  // - N8N_PROGRESS_WEBHOOK -> "Webhook for auto-check" node
  // - N8N_SAVE_WEBHOOK     -> "Webhook" node (manual save)
  const N8N_PROGRESS_WEBHOOK = 'https://YOUR_N8N_INSTANCE/webhook/YOUR_WEBHOOK_PATH_1'; // Auto-track progress
  const N8N_SAVE_WEBHOOK = 'https://YOUR_N8N_INSTANCE/webhook/YOUR_WEBHOOK_PATH_2'; // Manual save button

  // Set this to FALSE if you want to trigger the webhook every single time you refresh the page
  const USE_LOCAL_CACHE = false;

  // ===== AUTO-TRACK (Only runs on Chapter Pages) =====
  function initAutoTracker() {
    const url = new URL(window.location.href);
    // This regex looks for "/chapter-X/" in the URL
    const pathMatch = url.pathname.match(/\/manga\/([^/]+)\/chapter-(\d+(?:\.\d+)?)\//);

    // If we are on a Root page (no chapter in URL), stop here.
    if (!pathMatch) {
      console.log('[Manga Tracker] Root page detected. Auto-tracking skipped (Button only).');
      return;
    }

    const mangaSlug = decodeURIComponent(pathMatch[1]);
    const chapterNumber = parseFloat(pathMatch[2]);

    let shouldUpdate = true;

    if (USE_LOCAL_CACHE) {
      const cacheKey = `manga_${mangaSlug}`;
      const lastStoredChapter = GM_getValue(cacheKey, 0);

      if (chapterNumber <= lastStoredChapter) {
        shouldUpdate = false;
        console.log(`[Manga Tracker] Skipped: Chapter ${chapterNumber} is <= last saved (${lastStoredChapter}).`);
        console.log('Tip: Set USE_LOCAL_CACHE = false in script to force update on refresh.');
      }
    }

    if (shouldUpdate) {
        // Wait 1 second to ensure page title is ready
        setTimeout(() => {
            const mangaTitle = getMangaTitle();
            if (mangaTitle) {
                sendToWebhook(N8N_PROGRESS_WEBHOOK, {
                    manga: mangaTitle,
                    chapter: chapterNumber,
                    chapterSlug: mangaSlug,
                    url: window.location.href,
                    source: 'mangaread.org',
                    timestamp: new Date().toISOString(),
                    action: 'auto-track'
                });
            } else {
                console.error('[Manga Tracker] Could not find Manga Title for auto-track.');
            }
        }, 1000);
    }
  }

  // ===== CREATE FLOATING SAVE BUTTON (Runs everywhere) =====
  function createSaveButton() {
    // Prevent duplicate buttons
    if (document.getElementById('manga-save-btn')) return;

    const button = document.createElement('button');
    button.id = 'manga-save-btn';
    button.innerHTML = 'Save Manga';
    button.title = 'Manually save this manga to database';

    // Position: fixed, top-right corner
    Object.assign(button.style, {
      position: 'fixed',
      top: '80px', // Moved down slightly to not cover the search bar/header
      right: '20px',
      zIndex: '2147483647',
      padding: '12px 20px',
      backgroundColor: '#4CAF50',
      color: 'white',
      border: 'none',
      borderRadius: '25px',
      fontSize: '14px',
      fontWeight: 'bold',
      cursor: 'pointer',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      transition: 'all 0.3s ease',
      minWidth: '140px',
      fontFamily: 'system-ui, sans-serif'
    });

    // Hover effects
    button.addEventListener('mouseenter', () => {
      button.style.backgroundColor = '#45a049';
      button.style.transform = 'translateY(-2px)';
      button.style.boxShadow = '0 6px 20px rgba(0,0,0,0.4)';
    });
    button.addEventListener('mouseleave', () => {
      button.style.backgroundColor = '#4CAF50';
      button.style.transform = 'translateY(0)';
      button.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
    });

    // Click handler
    button.addEventListener('click', () => {
      const mangaTitle = getMangaTitle();
      const url = window.location.href;

      if (!mangaTitle) {
        alert('Could not detect manga title. Please wait a moment and try again.');
        return;
      }

      // Visual feedback
      const originalText = button.innerHTML;
      button.innerHTML = 'Saving...';
      button.disabled = true;
      button.style.backgroundColor = '#2196F3';

      sendToWebhook(N8N_SAVE_WEBHOOK, {
        manga: mangaTitle,
        url: url,
        source: 'mangaread.org',
        timestamp: new Date().toISOString(),
        action: 'manual-save'
      });

      // Reset button after 3s
      setTimeout(() => {
        button.innerHTML = originalText;
        button.disabled = false;
        button.style.backgroundColor = '#4CAF50';
      }, 3000);
    });

    // Append to body (safer than documentElement)
    document.body.appendChild(button);
    console.log('[Manga Tracker] Save button added');
  }

  // ===== HELPER FUNCTIONS =====
  function getMangaTitle() {
    // Strategy: Try OpenGraph meta tag first, then fallback to Title tag
    let title = null;

    // 1. Try OG Title (Most accurate)
    const metaTitle = document.querySelector('meta[property="og:title"]');
    if (metaTitle) {
        title = metaTitle.content;
    } else {
        // 2. Fallback to document title
        title = document.title;
    }

    if (!title) return null;

    // CLEANUP REGEX
    // 1. Remove "Chapter X" or "Chapter X.X"
    title = title.replace(/Chapter\s+\d+(\.\d+)?/i, '');
    // 2. Remove " - Read Manga Online" junk
    title = title.replace(/\s*-\s*Read.*$/i, '');
    title = title.replace(/\s*-\s*MangaRead.*$/i, '');
    // 3. Remove "Page X"
    title = title.replace(/Page\s+\d+/i, '');

    return title.trim();
  }

  function sendToWebhook(webhookUrl, payload) {
    console.log('[Manga Tracker] Sending webhook:', payload);

    GM_xmlhttpRequest({
      method: 'POST',
      url: webhookUrl,
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify(payload),
      onload: function(response) {
        if (response.status >= 200 && response.status < 300) {
          console.log('[Manga Tracker] Webhook success:', payload.manga);
          // Only update cache if it was an auto-track event
          if (payload.chapter && USE_LOCAL_CACHE) {
            const cacheKey = `manga_${payload.chapterSlug}`;
            GM_setValue(cacheKey, payload.chapter);
            console.log(`[Manga Tracker] Saved progress: Ch ${payload.chapter}`);
          }
        } else {
          console.warn('[Manga Tracker] Webhook error:', response.status, response.responseText);
        }
      },
      onerror: function(err) {
        console.error('[Manga Tracker] Webhook failed:', err);
      }
    });
  }

  // ===== INITIALIZE =====
  // Run immediately
  createSaveButton();
  initAutoTracker();

  // Watchdog: Check every 2 seconds to ensure button wasn't wiped by site navigation
  setInterval(() => {
      createSaveButton();
  }, 2000);
})();
