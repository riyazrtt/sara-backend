const express = require('express');
const cors = require('cors');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
let sock = null;
let qrCodeData = null;
let isConnected = false;

async function startWhatsApp() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState('auth_session');
        
        sock = makeWASocket({
            auth: state,
            printQRInTerminal: false
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                qrCodeData = await QRCode.toDataURL(qr);
                isConnected = false;
                console.log('New QR generated. Ready to scan from dashboard.');
            }

            if (connection === 'close') {
                isConnected = false;
                const statusCode = (lastDisconnect?.error)?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                console.log('Connection closed. Reconnecting:', shouldReconnect);
                if (shouldReconnect) {
                    setTimeout(startWhatsApp, 3000);
                }
            } else if (connection === 'open') {
                isConnected = true;
                qrCodeData = null;
                console.log('SARA WhatsApp Cloud Engine Connected Successfully!');
            }
        });
    } catch (err) {
        console.error('Socket init error:', err);
        setTimeout(startWhatsApp, 5000);
    }
}

startWhatsApp();

// 1. Keep-Alive endpoint (for UptimeRobot so it never sleeps)
app.get('/api/ping', (req, res) => {
    res.json({ status: 'alive', whatsapp_connected: isConnected, timestamp: new Date() });
});

// 2. Browser QR Scan UI
app.get('/', (req, res) => {
    if (isConnected) {
        return res.send(`
            <!DOCTYPE html>
            <html>
            <head><title>SARA Cloud</title><meta name="viewport" content="width=device-width, initial-scale=1"></head>
            <body style="background:#0c0c0e;color:#D4AF37;font-family:sans-serif;text-align:center;padding:40px 20px;">
                <h1 style="margin-bottom:10px;">✨ SARA Cloud Backend</h1>
                <div style="display:inline-block;padding:12px 24px;background:#152b1b;border:1px solid #25D366;border-radius:30px;color:#25D366;font-size:16px;font-weight:bold;">
                    ● WhatsApp Connected &amp; 24/7 Active
                </div>
                <p style="color:#8a8a8a;margin-top:20px;font-size:14px;">Uptime Ping: <code>/api/ping</code></p>
                <p style="color:#8a8a8a;font-size:14px;">Send Message: <code>/api/send</code></p>
            </body>
            </html>
        `);
    }

    if (qrCodeData) {
        return res.send(`
            <!DOCTYPE html>
            <html>
            <head><title>Link SARA WhatsApp</title><meta name="viewport" content="width=device-width, initial-scale=1"></head>
            <body style="background:#0c0c0e;color:#fff;font-family:sans-serif;text-align:center;padding:30px 15px;">
                <h2 style="color:#D4AF37;">Link SARA to WhatsApp</h2>
                <p style="color:#b0b0b0;font-size:14px;">WhatsApp kholen ➔ <b>Linked Devices</b> ➔ <b>Link a Device</b> ➔ QR scan karein:</p>
                <div style="background:#fff;display:inline-block;padding:16px;border-radius:16px;margin-top:16px;">
                    <img src="${qrCodeData}" width="260" height="260" />
                </div>
                <p style="color:#777;font-size:12px;margin-top:16px;">Scan hone par page automatically refresh ho jayega...</p>
                <script>setTimeout(() => location.reload(), 4000);</script>
            </body>
            </html>
        `);
    }

    res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>Starting...</title><meta name="viewport" content="width=device-width, initial-scale=1"></head>
        <body style="background:#0c0c0e;color:#fff;font-family:sans-serif;text-align:center;padding:50px 20px;">
            <h3 style="color:#D4AF37;">Initialising SARA WhatsApp Engine...</h3>
            <p style="color:#888;">Generating QR Code, please wait 5 seconds...</p>
            <script>setTimeout(() => location.reload(), 3000);</script>
        </body>
        </html>
    `);
});

// 3. Send Message API for SARA APK
app.post('/api/send', async (req, res) => {
    if (!isConnected || !sock) {
        return res.status(503).json({ success: false, error: 'WhatsApp is not connected yet.' });
    }

    try {
        let { phone, message } = req.body;
        if (!phone || !message) {
            return res.status(400).json({ success: false, error: 'phone and message are required' });
        }

        let cleanNumber = phone.replace(/[^0-9]/g, '');
        if (!cleanNumber.endsWith('@s.whatsapp.net')) {
            cleanNumber = `${cleanNumber}@s.whatsapp.net`;
        }

        await sock.sendMessage(cleanNumber, { text: message });
        res.json({ success: true, message: 'Message sent successfully via SARA Cloud' });
    } catch (err) {
        console.error('Send error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`SARA Backend listening on port ${PORT}`);
});
