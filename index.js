const axios = require('axios');

// הגדרות הבוט והחיפוש
const TELEGRAM_TOKEN = '8456860842:AAHF8hKUb-W9vVBO2N3ykcKLge14ObrtrXA';
const CHAT_ID = '858419911'; 

const TARGET_DESTINATION = 'ATH'; // אתונה
const START_DATE = '2026-03-30';
const END_DATE = '2026-04-03';
const AIRLINES = ['EL AL', 'ISRAIR', 'ARKIA', 'ELECTRA', '3E', 'BGH'];

async function checkFlights() {
    try {
        console.log("סורק לוח טיסות...");
        // פנייה למאגר נתוני נתב"ג הממשלתי
        const response = await axios.get('https://data.gov.il/api/3/action/datastore_search?resource_id=e83f7627-7460-449e-b3f4-d499e90097a2&limit=500');
        const flights = response.data.result.records;

        let foundMessages = [];

        flights.forEach(f => {
            const flightDate = f.CHSTOT.split('T')[0];
            const destination = f.CHLOC1CH; 
            const airline = f.CHOPER; 

            if (flightDate >= START_DATE && flightDate <= END_DATE && destination === TARGET_DESTINATION) {
                const isRelevant = AIRLINES.some(a => airline.toUpperCase().includes(a));
                
                if (isRelevant) {
                    foundMessages.push(`✈️ *טיסה נמצאה!*\nחברה: ${airline}\nמספר: ${f.CHFLTN}\nתאריך: ${flightDate}\nשעה: ${f.CHSTOT.split('T')[1].substring(0,5)}`);
                }
            }
        });

        if (foundMessages.length > 0) {
            const text = `📢 *עדכון סוכן הטיסות (30.03-03.04):*\n\n` + foundMessages.join('\n---\n');
            await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
                chat_id: CHAT_ID,
                text: text,
                parse_mode: 'Markdown'
            });
            console.log("התראה נשלחה לטלגרם!");
        } else {
            console.log("סריקה הושלמה - לא נמצאו טיסות חדשות.");
        }
    } catch (error) {
        console.error("שגיאה בסריקה:", error.message);
    }
}

checkFlights();
