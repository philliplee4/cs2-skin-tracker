# Skinport Integration - Quick Start Guide

## 🚀 Get Started in 5 Minutes

### Step 1: Get Your API Key (2 minutes)
1. Go to [https://skinport.com](https://skinport.com)
2. Sign up or log in
3. Visit [https://skinport.com/api](https://skinport.com/api)
4. Click "Generate API Key"
5. Copy your **Client ID** and **Client Secret**

### Step 2: Configure the App (1 minute)
1. Open [profile.html](profile.html) in your browser
2. You'll see "Configure Skinport API" prompt
3. Click "Configure Now"
4. Paste your Client ID and Client Secret
5. Click "Save Credentials"
6. Click "Test Connection" to verify

### Step 3: Start Tracking (2 minutes)
1. Go to [index.html](index.html)
2. Browse and click on any item (e.g., AK-47 | Redline)
3. Click "Track This Item"
4. Set your criteria:
   - Price: $5 - $20
   - Wear: Field-Tested
   - StatTrak: Any
5. Click "Start Tracking"
6. Go back to Profile to see matches!

## 🎯 What You Can Track

### Price Range
```
Min: $5, Max: $20
→ Shows only items between $5-$20
```

### Wear Conditions
- **Preset**: Factory New, Minimal Wear, Field-Tested, Well-Worn, Battle-Scarred
- **Custom**: Exact float range (e.g., 0.00 - 0.07)
- **Any**: All conditions

### StatTrak
- **Any**: With or without StatTrak
- **Required**: Only StatTrak items
- **None**: No StatTrak

### Pattern Numbers
```
Pattern: 661
→ Tracks Blue Gem patterns
```

## 📊 Example Tracking Scenarios

### Scenario 1: Budget AK-47 Redline
```
Item: AK-47 | Redline
Price: $5 - $15
Wear: Field-Tested
StatTrak: Any
```

### Scenario 2: Low Float AWP Dragon Lore
```
Item: AWP | Dragon Lore
Price: Any
Wear: Custom (0.00 - 0.07)
StatTrak: None
```

### Scenario 3: StatTrak Karambit
```
Item: Karambit | Doppler
Price: Any
Wear: Factory New
StatTrak: Required
```

## 🔍 Finding Your Matches

### On Profile Page
- **Skinport Matches** section shows all matching items
- Sorted by price (cheapest first)
- Click "View on Skinport" to see the item
- Auto-refreshes every 5 minutes
- Manual refresh button available

### What You'll See
- Item name and wear condition
- Current price vs suggested price
- Discount percentage (if any)
- Tradable status
- Direct link to Skinport

## ⚡ Pro Tips

1. **Start Broad, Then Narrow**
   - Begin with "Any" for wear and StatTrak
   - See what's available
   - Adjust criteria based on results

2. **Set Realistic Prices**
   - Check market prices first
   - Leave some room in your range
   - Don't set max too low

3. **Use the Refresh Button**
   - Click when you want fresh data
   - Clears the cache
   - Gets latest listings

4. **Track Multiple Variants**
   - Track same item with different criteria
   - Compare prices across wear conditions
   - Find the best deals

5. **Check Regularly**
   - Good deals go fast
   - Auto-refresh keeps you updated
   - Set up multiple tracked items

## 🛠️ Troubleshooting

### No Matches Found?
- ✅ Try expanding your price range
- ✅ Change wear to "Any"
- ✅ Remove StatTrak requirement
- ✅ Verify item exists on Skinport

### Connection Failed?
- ✅ Double-check your API credentials
- ✅ Make sure there are no extra spaces
- ✅ Try copy-pasting again
- ✅ Verify your Skinport account is active

### Not Updating?
- ✅ Click the Refresh button
- ✅ Wait for auto-refresh (5 minutes)
- ✅ Clear browser cache
- ✅ Reload the page

### Still Having Issues?
1. Open browser console (F12)
2. Look for error messages
3. Check the [SKINPORT_SETUP.md](SKINPORT_SETUP.md) guide
4. Use [skinport-test.html](skinport-test.html) to debug

## 📚 Learn More

- **[SKINPORT_SETUP.md](SKINPORT_SETUP.md)** - Complete setup guide
- **[SKINPORT_EXAMPLES.md](SKINPORT_EXAMPLES.md)** - Code examples
- **[README_SKINPORT.md](README_SKINPORT.md)** - Full documentation

## 🎮 Happy Trading!

You're all set! Start tracking your favorite CS2 items and never miss a good deal again.

---

**Need Help?** Check the documentation files or open [skinport-test.html](skinport-test.html) to test your setup.
