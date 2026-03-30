const axios = require('axios');

// הגדרות אישיות
const TELEGRAM_TOKEN = '8456860842:AAHF8hKUb-W9vVBO2N3ykcKLge14ObrtrXA';
const CHAT_ID = '858419911'; 

// פרמטרי חיפוש מורחבים
const TARGET_DESTINATIONS = ['ATH', 'FCO']; // ATH = אתונה, FCO = רומא
const START_DATE = '2026-03-30';
const END_DATE = '2026-04-03';
const AIRLINES = ['EL AL', 'ISRAIR', 'ARKIA', 'ELECTRA', '3E', 'BGH'];

async function sendTelegram(message) {
    try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
            chat_id: CHAT_ID,
            text: message,
            parse_mode: 'Markdown'
        });
    } catch (e) {
        console.error("Telegram Error:", e.response ? e.response.data : e.message);
    }
}

async function checkFlights() {
    try {
        console.log("סורק לוח טיסות עבור אתונה ורומא...");
        
        const RESOURCE_ID = 'e83f763b-b7d7-479e-b172-ae981ddc6de5'; 
        const url = `https://data.gov.il/api/3/action/datastore_search?resource_id=${RESOURCE_ID}&limit=1000`;
        
        const response = await axios.get(url);
        const flights = response.data.result.records;

        let foundMessages = [];
        let totalScanned = flights.length;

        flights.forEach(f => {
            if (!f.CHSTOT || !f.CHLOC1) return;

            const flightDate = f.CHSTOT.split('T')[0];
            const destination = f.CHLOC1; 
            const airline = f.CHOPER || "";
            const flightNum = f.CHFLTN || "";

            // בדיקה אם התאריך בטווח והיעד הוא אחד מהשניים
            if (flightDate >= START_DATE && flightDate <= END_DATE && TARGET_DESTINATIONS.includes(destination)) {
                const isRelevant = AIRLINES.some(a => airline.toUpperCase().includes(a));
                if (isRelevant) {
                    const destName = destination === 'ATH' ? 'אתונה 🇬🇷' : 'רומא 🇮🇹';
                    const status = f.CHRMINE || 'מתוכנן';
                    foundMessages.push(`✈️ *טיסה ל${destName} נמצאה!*\nחברה: ${airline}\nמספר: ${flightNum}\nתאריך: ${flightDate}\nשעה: ${f.CHSTOT.split('T')[1].substring(0,5)}\nסטטוס: ${status}`);
                }
            }
        });

        if (foundMessages.length > 0) {
            await sendTelegram(`📢 *עדכון סוכן הטיסות (אתונה & רומא):*\n\n` + foundMessages.join('\n---\n'));
        } else {
            await sendTelegram(`✅ *הסוכן פעיל:* נסרקו ${totalScanned} טיסות. לא נמצאו כרגע טיסות חדשות לאתונה או רומא בטווח המבוקש.`);
        }

    } catch (error) {
        console.error("Error:", error.message);
        await sendTelegram(`⚠️ *שגיאה בסוכן:* ${error.message}`);
    }
}

checkFlights();
