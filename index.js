const {
    Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder,
    ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits,
    MessageFlags
} = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const http = require('http'); // เพิ่มสำหรับ Web Server
require('dotenv').config();

// --- 🌐 WEB SERVER (Keep-Alive) ---
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
    res.write("Bot is running!");
    res.end();
});

// เริ่มรัน Web Server แบบดักจับ Error
server.listen(PORT, () => {
    console.log(`🌐 Web/Keep-Alive server active on port ${PORT}`);
}).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.log(`⚠️ Port ${PORT} ล็อคอยู่ (เครื่องคุณอาจมีโปรแกรมอื่นใช้) : ระบบบอทจะยังทำงานต่อตามปกติครับ`);
    } else {
        console.error('Web Server Error:', err);
    }
});
// --------------------------------

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

// ตั้งค่า AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// ใช้ gemini-flash-latest (เวอร์ชั่น 1.5) ที่ทดสอบแล้วว่ายังไม่ติด Limit
const aiModel = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: "คุณคือ AI ผู้ช่วยของเซิร์ฟเวอร์ NaluephanBot หน้าที่ของคุณคือให้ความช่วยเหลือ ตอบคำถาม และสร้างความบันเทิงให้กับสมาชิกในเซิร์ฟเวอร์อย่างเป็นมิตรและสุภาพ",
    tools: [
        {
            googleSearch: {}
        }
    ]
});

// ฐานข้อมูลจำลอง
const db = {
    economy: new Map(),
    xp: new Map(),
    lastWork: new Map(),
    lastLuck: new Map(),
};

const fortunes = [
    { text: "วันนี้ดวงพุ่งแรงที่สุด! มีเกณฑ์ได้รับโชคลาภก้อนโต", color: "#FFD700" },
    { text: "การงานราบรื่น มีผู้ใหญ่คอยอุปถัมภ์คำชู", color: "#00FF00" },
    { text: "ความรักสดใส คนมีคู่จะมีความสุขมาก", color: "#FF69B4" },
    { text: "วันนี้ดวงสร้างสรรค์กำลังมา! เหมาะแก่การเริ่มสิ่งใหม่", color: "#9B59B6" }
];

client.once('clientReady', (c) => {
    console.log(`\n======================================`);
    console.log(`👑 SUPER BOT ONLINE: ${c.user.tag}`);
    console.log(`🌐 Web/Keep-Alive server on port 3000`);
    console.log(`======================================\n`);
});

// ตัวแปรสำหรับ AI Memory (เก็บประวัติการสนทนา)
const aiMemory = new Map(); // เก็บ userId -> history array

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // --- 🤖 AI CHAT (Tag or !ask) ---
    if (message.content.startsWith('!ask') || message.mentions.has(client.user)) {
        const query = message.content.replace('!ask', '').replace(/<@!?[0-9]+>/, '').trim();
        if (!query) return message.reply('❓ ถามอะไรหน่อยสิครับ');

        await message.channel.sendTyping();
        try {
            // ดึงประวัติการคุยของ User คนนี้ (เก็บสูงสุด 5 ข้อความล่าสุด)
            let history = aiMemory.get(message.author.id) || [];

            // เพิ่มคำถามใหม่เข้าไปในประวัติ
            history.push({ role: "user", parts: [{ text: query }] });

            // ใช้ระบบ Chat Session เพื่อให้จำบริบท
            const chatSession = aiModel.startChat({
                history: history
            });

            const result = await chatSession.sendMessage(query);
            const response = result.response.text();

            // เพิ่มคำตอบของ AI เข้าไปในประวัติ
            history.push({ role: "model", parts: [{ text: response }] });

            // จำแค่ 10 ข้อความล่าสุด (ถาม 5, ตอบ 5) เพื่อไม่ให้เปลือง Token
            if (history.length > 10) history = history.slice(history.length - 10);
            aiMemory.set(message.author.id, history);

            // แบ่งข้อความถ้าเกิน 2000 ตัวอักษร
            if (response.length > 2000) {
                for (let i = 0; i < response.length; i += 2000) {
                    await message.reply(response.substring(i, i + 2000));
                }
            } else {
                await message.reply(response);
            }
        } catch (error) {
            console.error('AI Error:', error);
            if (error?.message?.includes('429')) {
                return message.reply('⏳ ตอนนี้ AI ใช้งานหนักเกินลิมิต โปรดรอสักครู่แล้วลองใหม่ครับ');
            }
            message.reply('❌ เกิดข้อผิดพลาดในการเชื่อมต่อกับ AI');
            // รีเซ็ตความจำถ้าเกิด Error ป้องกันค้าง
            aiMemory.delete(message.author.id);
        }
        return; // จบการทำงาน ไม่ต้องไปทำอย่างอื่นต่อ
    }

    db.xp.set(message.author.id, (db.xp.get(message.author.id) || 0) + 2);

    // --- 🛡️ AUTO-MOD ---
    const badWords = ['ไอนหน้าหี', 'ควาย', 'ไอ้', 'โง่', 'พ่อมึงสิ'];
    if (badWords.some(word => message.content.includes(word))) {
        await message.delete().catch(() => { });
        return message.channel.send(`⚠️ <@${message.author.id}> ระวังคำพูดด้วยครับ`).then(m => setTimeout(() => m.delete(), 3000));
    }

    // --- !setup-profile ---
    if (message.content === '!setup-profile') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return;
        try {
            const channel = await message.guild.channels.create({
                name: '📈-เช็คโปรไฟล์',
                type: ChannelType.GuildText,
                topic: 'ห้องสำหรับดูสถิติและโปรไฟล์ส่วนตัว',
            });
            const embed = new EmbedBuilder().setColor('#5865F2').setTitle('👤 ระบบตรวจสอบโปรไฟล์สมาชิก').setDescription('กดปุ่มด้านล่างเพื่อดูสถาณะของคุณ (เห็นเฉพาะคุณ)');
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_check_profile').setLabel('ดูโปรไฟล์ของฉัน').setStyle(ButtonStyle.Primary).setEmoji('👤'));
            await channel.send({ embeds: [embed], components: [row] });
            await message.reply(`✅ สร้างห้องเช็คโปรไฟล์แล้ว: <#${channel.id}>`);
        } catch (e) { message.reply('❌ บอทขาดสิทธิ์สร้างห้องครับ'); }
    }

    // --- !เมนู ---
    if (message.content === '!เมนู' || message.content === '!menu') {
        const embed = new EmbedBuilder().setColor('#5865F2').setTitle('💎 KhunPor Control Center').setDescription('เลือกใช้งานฟังก์ชันต่างๆ ครับ');
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_luck').setLabel('สุ่มดวง').setStyle(ButtonStyle.Primary).setEmoji('🔮'),
            new ButtonBuilder().setCustomId('btn_daily').setLabel('รับเงินรายวัน').setStyle(ButtonStyle.Success).setEmoji('💵'),
            new ButtonBuilder().setCustomId('btn_ticket').setLabel('แจ้งปัญหา/Ticket').setStyle(ButtonStyle.Secondary).setEmoji('📩')
        );
        await message.reply({ embeds: [embed], components: [row] });
    }

    // --- !clear (ลบข้อความ) [PRACTICAL FUNCTION] ---
    if (message.content.startsWith('!clear')) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return message.reply('❌ คุณไม่มีสิทธิ์จัดการข้อความครับ');
        }
        const amount = parseInt(message.content.split(' ')[1]);
        if (isNaN(amount) || amount < 1 || amount > 100) {
            return message.reply('⚠️ กรุณาระบุจำนวน 1-100 เช่น `!clear 10`');
        }
        try {
            await message.channel.bulkDelete(amount, true);
            const m = await message.channel.send(`🧹 ล้างบางไปแล้ว ${amount} ข้อความ!`);
            setTimeout(() => m.delete().catch(() => { }), 4000);
        } catch (e) {
            message.reply('❌ ไม่สามารถลบข้อความที่เก่าเกิน 14 วันได้ครับ');
        }
    }

    // --- !poll (สร้างโพล) [PRACTICAL FUNCTION] ---
    if (message.content.startsWith('!poll')) {
        const question = message.content.replace('!poll', '').trim();
        if (!question) return message.reply('⚠️ กรุณาใส่คำถาม เช่น `!poll พรุ่งนี้หยุดไหม?`');

        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('📊 โพลสำรวจความคิดเห็น')
            .setDescription(`**${question}**`)
            .setFooter({ text: `สร้างโดย: ${message.author.tag}` })
            .setTimestamp();

        const pollMsg = await message.channel.send({ embeds: [embed] });
        await pollMsg.react('👍');
        await pollMsg.react('👎');
    }

    // --- !userinfo (ดูข้อมูลผู้ใช้) [PRACTICAL FUNCTION] ---
    if (message.content.startsWith('!userinfo')) {
        const member = message.mentions.members.first() || message.member;
        const target = member.user;

        const embed = new EmbedBuilder()
            .setColor('#00FFFF')
            .setTitle(`📋 ข้อมูลผู้ใช้: ${target.tag}`)
            .setThumbnail(target.displayAvatarURL())
            .addFields(
                { name: '🆔 ID', value: target.id, inline: true },
                { name: '📅 สร้างบัญชีเมื่อ', value: `<t:${Math.floor(target.createdTimestamp / 1000)}:d>`, inline: true },
                { name: '🚪 เข้าเซิร์ฟเมื่อ', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:d>`, inline: true },
                { name: '🏷️ ยศที่มี', value: member.roles.cache.filter(r => r.name !== '@everyone').map(r => `<@&${r.id}>`).join(' ') || 'ไม่มี', inline: false }
            );
        message.reply({ embeds: [embed] });
    }

    // --- !avatar (ดึงรูปโปรไฟล์ชัดๆ) [PRACTICAL FUNCTION] ---
    if (message.content.startsWith('!avatar')) {
        const target = message.mentions.users.first() || message.author;
        const embed = new EmbedBuilder()
            .setColor('#FF0099')
            .setTitle(`🖼️ รูปโปรไฟล์ของ ${target.username}`)
            .setImage(target.displayAvatarURL({ size: 1024, dynamic: true }));

        message.reply({ embeds: [embed] });
    }

    // --- !serverinfo (ดูข้อมูลเซิร์ฟเวอร์) [PRACTICAL FUNCTION] ---
    if (message.content.startsWith('!serverinfo')) {
        const guild = message.guild;
        const embed = new EmbedBuilder()
            .setColor('#FFA500')
            .setTitle(`🏰 ข้อมูลเซิร์ฟเวอร์: ${guild.name}`)
            .setThumbnail(guild.iconURL())
            .addFields(
                { name: '🆔 ID', value: guild.id, inline: true },
                { name: '👥 สมาชิก', value: `${guild.memberCount} คน`, inline: true },
                { name: '📅 สร้างเมื่อ', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:d>`, inline: true },
                { name: '👑 เจ้าของ', value: `<@${guild.ownerId}>`, inline: true },
                { name: '🏷️ ยศทั้งหมด', value: `${guild.roles.cache.size} ยศ`, inline: true }
            );
        message.reply({ embeds: [embed] });
    }

    // --- !ping (เช็คความหน่วง) [PRACTICAL FUNCTION] ---
    if (message.content === '!ping') {
        const sent = await message.reply('🏓 Pinging...');
        sent.edit(`🏓 Pong! Latency: ${sent.createdTimestamp - message.createdTimestamp}ms`);
    }

    // --- !roll (ทอยลูกเต๋า) [PRACTICAL FUNCTION] ---
    if (message.content.startsWith('!roll')) {
        const result = Math.floor(Math.random() * 6) + 1;
        message.reply(`🎲 ทอยลูกเต๋าได้: **${result}** แต้ม`);
    }

    // --- !coin (โยนเหรียญ) [PRACTICAL FUNCTION] ---
    if (message.content.startsWith('!coin')) {
        const result = Math.random() < 0.5 ? 'หัว (Heads)' : 'ก้อย (Tails)';
        message.reply(`🪙 ผลการโยนเหรียญ: **${result}**`);
    }

    // --- !say (ให้บอทพูดแทน) [PRACTICAL FUNCTION] ---
    if (message.content.startsWith('!say')) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return;
        const msg = message.content.replace('!say', '').trim();
        if (!msg) return message.reply('❌ กรุณาพิมพ์ข้อความที่จะให้บอทพูด');
        await message.delete();
        await message.channel.send(msg);
    }

    // --- !calc (เครื่องคิดเลข) [PRACTICAL FUNCTION] ---
    if (message.content.startsWith('!calc')) {
        try {
            const expr = message.content.replace('!calc', '').trim();
            if (!expr) return message.reply('❌ กรุณาใส่โจทย์เลข เช่น `!calc 10+20`');

            // ใช้ Function ปลอดภัยกว่า eval เล็กน้อย แต่ยังต้องระวัง
            // ในที่นี้รับเฉพาะตัวเลขและเครื่องหมายทางคณิตศาสตร์
            if (!/^[0-9+\-*/().\s]+$/.test(expr)) {
                return message.reply('❌ โปรดใส่เฉพาะตัวเลขและเครื่องหมาย +, -, *, /');
            }

            const result = Function(`return (${expr})`)();
            const embed = new EmbedBuilder()
                .setColor('#00AAFF')
                .setTitle('🧮 เครื่องคิดเลข')
                .addFields(
                    { name: 'โจทย์', value: `\`\`\`${expr}\`\`\``, inline: false },
                    { name: 'ผลลัพธ์', value: `\`\`\`${result}\`\`\``, inline: false }
                );
            message.reply({ embeds: [embed] });
        } catch (e) {
            message.reply('❌ คำนวณไม่ได้ครับ ตรวจสอบโจทย์อีกครั้ง');
        }
    }

    // --- 🏆 !top (ตารางผู้นำท็อป 5) [NEW FUNCTION] ---
    if (message.content.startsWith('!top') || message.content.startsWith('!leaderboard')) {
        const topXP = [...db.xp.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
        const topMoney = [...db.economy.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

        const xpText = topXP.length > 0
            ? topXP.map((entry, i) => `**#${i + 1}** <@${entry[0]}> - เลเวล: ${Math.floor(Math.sqrt(entry[1] / 10))} (${entry[1]} XP)`).join('\n')
            : 'ยังไม่มีข้อมูล';

        const moneyText = topMoney.length > 0
            ? topMoney.map((entry, i) => `**#${i + 1}** <@${entry[0]}> - 💰 ${entry[1]} เหรียญ`).join('\n')
            : 'ยังไม่มีข้อมูล';

        const embed = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle('🏆 กระดานผู้นำ (Leaderboard)')
            .addFields(
                { name: '⭐ ท็อปเลเวล (XP)', value: xpText, inline: false },
                { name: '💶 ท็อปเศรษฐี (เงิน)', value: moneyText, inline: false }
            )
            .setTimestamp();

        return message.reply({ embeds: [embed] });
    }

    // --- 🎰 !slots (เล่นสล็อตเดิมพัน) [NEW FUNCTION] ---
    if (message.content.startsWith('!slots')) {
        const args = message.content.split(' ');
        const bet = parseInt(args[1]);
        const userMoney = db.economy.get(message.author.id) || 0;

        if (isNaN(bet) || bet <= 0) return message.reply('⚠️ ระบุจำนวนเงินเดิมพันด้วย เช่น `!slots 10`');
        if (bet > userMoney) return message.reply('❌ เงินคุณไม่พอครับ!');

        const fruits = ['🍎', '🍌', '🍒', '🍇', '🍉', '💎'];
        const slot1 = fruits[Math.floor(Math.random() * fruits.length)];
        const slot2 = fruits[Math.floor(Math.random() * fruits.length)];
        const slot3 = fruits[Math.floor(Math.random() * fruits.length)];

        let resultText = '';

        db.economy.set(message.author.id, userMoney - bet); // หักเงินก่อน

        if (slot1 === slot2 && slot2 === slot3) {
            let winAmount = bet * 10;
            if (slot1 === '💎') winAmount = bet * 50; // แจ็คพอตใหญ่
            db.economy.set(message.author.id, db.economy.get(message.author.id) + winAmount);
            resultText = `🎉 **แจ็คพอตแตก!** ได้รับ ${winAmount} เหรียญ`;
        } else if (slot1 === slot2 || slot2 === slot3 || slot1 === slot3) {
            const winAmount = bet * 2;
            db.economy.set(message.author.id, db.economy.get(message.author.id) + winAmount);
            resultText = `😁 **ชนะนิดหน่อย!** ได้รับ ${winAmount} เหรียญ`;
        } else {
            resultText = `😢 **เสียใจด้วย!** คุณเสียเดิมพัน ${bet} เหรียญ`;
        }

        const embed = new EmbedBuilder()
            .setColor('#FFA500')
            .setTitle('🎰 สล็อตแมชชีน')
            .setDescription(`**[  ${slot1}  |  ${slot2}  |  ${slot3}  ]**\n\n${resultText}`)
            .setFooter({ text: `ยอดเงินคงเหลือ: ${db.economy.get(message.author.id)} เหรียญ` });

        return message.reply({ embeds: [embed] });
    }

    // --- ✌️ !rps (เป่ายิ้งฉุบ) [NEW FUNCTION] ---
    if (message.content.startsWith('!rps')) {
        const args = message.content.split(' ');
        const playerChoice = args[1]?.toLowerCase();
        const choices = ['ค้อน', 'กรรไกร', 'กระดาษ'];

        if (!playerChoice || !['ค้อน', 'กรรไกร', 'กระดาษ', 'rock', 'paper', 'scissors'].includes(playerChoice)) {
            return message.reply('⚠️ ระบุตัวเลือกด้วยครับ: `!rps ค้อน` หรือ `!rps กระดาษ` หรือ `!rps กรรไกร`');
        }

        let mappedPlayer = playerChoice;
        if (playerChoice === 'rock') mappedPlayer = 'ค้อน';
        if (playerChoice === 'paper') mappedPlayer = 'กระดาษ';
        if (playerChoice === 'scissors') mappedPlayer = 'กรรไกร';

        const botChoice = choices[Math.floor(Math.random() * choices.length)];
        let result = '';

        if (mappedPlayer === botChoice) result = '🤝 **เสมอ!**';
        else if (
            (mappedPlayer === 'ค้อน' && botChoice === 'กรรไกร') ||
            (mappedPlayer === 'กรรไกร' && botChoice === 'กระดาษ') ||
            (mappedPlayer === 'กระดาษ' && botChoice === 'ค้อน')
        ) {
            result = '🎉 **คุณชนะ!**';
            db.economy.set(message.author.id, (db.economy.get(message.author.id) || 0) + 10);
            result += ' (ได้รับ 10 เหรียญเป็นรางวัล)';
        } else {
            result = '😭 **คุณแพ้!**';
        }

        return message.reply(`คุณออก: **${mappedPlayer}**\nบอทออก: **${botChoice}**\n\n${result}`);
    }

    // --- ⏰ !remindme (ตั้งเวลาเตือน) [NEW FUNCTION] ---
    if (message.content.startsWith('!remindme')) {
        const args = message.content.split(' ');
        const timeStr = args[1]; // เช่น 10m
        const reminderText = args.slice(2).join(' ');

        if (!timeStr || !reminderText || (!timeStr.endsWith('m') && !timeStr.endsWith('h'))) {
            return message.reply('⚠️ วิธีใช้: `!remindme <เวลา> <ข้อความ>` เช่น `!remindme 10m ไปตากผ้า` หรือ `!remindme 1h` (รองรับ m และ h)');
        }

        let timeMs = 0;
        let timeLabel = '';
        if (timeStr.endsWith('m')) {
            const mins = parseInt(timeStr);
            if (isNaN(mins)) return message.reply('❌ รูปแบบเวลาไม่ถูกต้อง');
            timeMs = mins * 60 * 1000;
            timeLabel = `${mins} นาที`;
        } else if (timeStr.endsWith('h')) {
            const hrs = parseInt(timeStr);
            if (isNaN(hrs)) return message.reply('❌ รูปแบบเวลาไม่ถูกต้อง');
            timeMs = hrs * 60 * 60 * 1000;
            timeLabel = `${hrs} ชั่วโมง`;
        }

        if (timeMs <= 0 || timeMs > 24 * 60 * 60 * 1000) {
            return message.reply('❌ ระบุเวลาให้ถูกต้อง (รับไม่เกิน 24 ชั่วโมง)');
        }

        message.reply(`✅ รับทราบ! ระบบจะแจ้งเตือนคุณในอีก **${timeLabel}** ข้างหน้าเกี่ยวกับ: *"${reminderText}"*`);

        setTimeout(() => {
            message.author.send(`⏰ **ถึงเวลาแล้ว!** ระบบแจ้งเตือนของคุณ:\n> "${reminderText}"\n(ตั้งเตือนมาจากเซิร์ฟเวอร์ ${message.guild?.name || 'DM'})`).catch(() => {
                message.channel.send(`⏰ <@${message.author.id}> **ถึงเวลาแล้ว!**\n> "${reminderText}"`);
            });
        }, timeMs);
        return;
    }

    // --- 🎁 !giveaway (แจกของรางวัล) [NEW FUNCTION] ---
    if (message.content.startsWith('!giveaway')) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply('❌ คุณต้องเป็นแอดมินหรือมีสิทธิ์พิเศษถึงจะจัดกิจกรรมแจกของได้ครับ');
        }

        const args = message.content.split(' ');
        const timeStr = args[1];
        const prize = args.slice(2).join(' ');

        if (!timeStr || !prize || (!timeStr.endsWith('m') && !timeStr.endsWith('h'))) {
            return message.reply('⚠️ วิธีใช้: `!giveaway <เวลา> <ของรางวัล>` เช่น `!giveaway 1m VIP Role` (รองรับ m นาที / h ชั่วโมง)');
        }

        let timeMs = 0;
        if (timeStr.endsWith('m')) timeMs = parseInt(timeStr) * 60 * 1000;
        else if (timeStr.endsWith('h')) timeMs = parseInt(timeStr) * 60 * 60 * 1000;

        if (isNaN(timeMs) || timeMs <= 0 || timeMs > 24 * 60 * 60 * 1000) {
            return message.reply('❌ ระบุเวลาให้ถูกต้อง (ไม่เกิน 24h)');
        }

        const endTime = Math.floor((Date.now() + timeMs) / 1000);

        const embed = new EmbedBuilder()
            .setColor('#FF00FF')
            .setTitle('🎁 **กิจกรรมแจกของรางวัล (Giveaway)!**')
            .setDescription(`**รางวัล:** ${prize}\n**หมดเวลา:** <t:${endTime}:R>\n**ผู้จัด:** <@${message.author.id}>\n\n🚨 **กดรีแอคชัน 🎉 ด้านล่างข้อความนี้เพื่อเข้าร่วม!**`)
            .setTimestamp(Date.now() + timeMs);

        const giveMsg = await message.channel.send({ content: '🎉 **GIVEAWAY START!** 🎉', embeds: [embed] });
        await giveMsg.react('🎉');

        setTimeout(async () => {
            try {
                const fetchMsg = await message.channel.messages.fetch(giveMsg.id);
                const reaction = fetchMsg.reactions.cache.get('🎉');
                if (!reaction) return;

                const users = await reaction.users.fetch();
                const validUsers = users.filter(u => !u.bot).map(u => u.id);

                if (validUsers.length === 0) {
                    return message.channel.send(`😔 ไม่มีคนเข้าร่วมชิงรางวัล **${prize}** เลย`);
                }

                const winner = validUsers[Math.floor(Math.random() * validUsers.length)];
                message.channel.send(`🎉 ขอแสดงความยินดีกับ <@${winner}>! คุณโชคดีได้รับ **${prize}** 🎁 (ผู้จัด: <@${message.author.id}>)`);

                const endEmbed = new EmbedBuilder()
                    .setColor('#808080')
                    .setTitle('🎁 **กิจกรรมแจกของรางวัลจบแล้ว**')
                    .setDescription(`**รางวัล:** ${prize}\n**ผู้ชนะ:** <@${winner}>`)
                    .setTimestamp();
                await fetchMsg.edit({ content: '🎊 **GIVEAWAY ENDED!** 🎊', embeds: [endEmbed] });
            } catch (e) {
                console.error("Giveaway Error:", e);
            }
        }, timeMs);
        return;
    }
    // --- 🎭 !role-setup (แผงรับยศ) [NEW FUNCTION] ---
    if (message.content.startsWith('!role-setup')) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return;

        const embed = new EmbedBuilder()
            .setColor('#E67E22')
            .setTitle('🎭 เลือกรับยศที่ต้องการ')
            .setDescription('กดปุ่มด้านล่างเพื่อรับหรือเอายศออกครับ');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('role_gamer').setLabel('🎮 MLBB').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('role_music').setLabel('🎵 ROV').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('role_anime').setLabel('🎌 FC Online').setStyle(ButtonStyle.Danger)
        );

        await message.channel.send({ embeds: [embed], components: [row] });
    }
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    // --- 🎭 Reaction Roles Handling ---
    if (interaction.customId.startsWith('role_')) {
        // ต้องไปสร้างยศชื่อ Gamer, Music Lover, Anime Fan ไว้ในเซิร์ฟเวอร์ก่อน
        let roleName = '';
        if (interaction.customId === 'role_gamer') roleName = 'MLBB';
        if (interaction.customId === 'role_music') roleName = 'ROV';
        if (interaction.customId === 'role_anime') roleName = 'FC Online';

        const role = interaction.guild.roles.cache.find(r => r.name === roleName);
        if (!role) {
            return interaction.reply({ content: `❌ แอดมินยังไม่ได้สร้างยศ **${roleName}** ในเทียร์ตั้งค่าเซิร์ฟเวอร์ครับ`, flags: [MessageFlags.Ephemeral] });
        }

        const member = interaction.member;
        if (member.roles.cache.has(role.id)) {
            await member.roles.remove(role);
            return interaction.reply({ content: `➖ ถอดยศ **${roleName}** ออกแล้ว`, flags: [MessageFlags.Ephemeral] });
        } else {
            await member.roles.add(role);
            return interaction.reply({ content: `✅ ได้รับยศ **${roleName}** แล้ว`, flags: [MessageFlags.Ephemeral] });
        }
    }

    // Ticket (ความลับ)
    if (interaction.customId === 'btn_ticket') {
        try {
            const channel = await interaction.guild.channels.create({
                name: `📩-ticket-${interaction.user.username}`,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                ],
            });
            await channel.send(`📩 **Support Ticket** สำหรับ <@${interaction.user.id}>\nกรุณาแจ้งปัญหาไว้ที่นี่ แอดมินจะมาช่วยครับ`);
            await interaction.reply({ content: `✅ สร้างห้องลับแล้ว: <#${channel.id}>`, flags: [MessageFlags.Ephemeral] });
        } catch (e) { await interaction.reply({ content: '❌ บอทขาดสิทธิ์สร้างห้องลับ', flags: [MessageFlags.Ephemeral] }); }
    }

    // Profile (Ephemeral)
    if (interaction.customId === 'btn_check_profile') {
        const money = db.economy.get(interaction.user.id) || 0;
        const xp = db.xp.get(interaction.user.id) || 0;
        const level = Math.floor(Math.sqrt(xp / 10));
        const embed = new EmbedBuilder().setColor('#F1C40F').setTitle(`👤 โปรไฟล์คุณ ${interaction.user.username}`).addFields({ name: '💰 เงิน', value: `\`${money}\``, inline: true }, { name: '🆙 เลเวล', value: `Level \`${level}\``, inline: true });
        await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
    }

    // Luck
    if (interaction.customId === 'btn_luck') {
        const lastLuck = db.lastLuck.get(interaction.user.id) || 0;
        if (Date.now() - lastLuck < 24 * 60 * 60 * 1000) return interaction.reply({ content: '⏳ พรุ่งนี้ค่อยมาดูใหม่นะ', flags: [MessageFlags.Ephemeral] });
        const luck = fortunes[Math.floor(Math.random() * fortunes.length)];
        db.lastLuck.set(interaction.user.id, Date.now());
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(luck.color).setTitle('🔮 คำทำนาย').setDescription(luck.text)], flags: [MessageFlags.Ephemeral] });
    }

    // Daily
    if (interaction.customId === 'btn_daily') {
        const lastDaily = db.lastWork.get(interaction.user.id) || 0;
        if (Date.now() - lastDaily < 24 * 60 * 60 * 1000) return interaction.reply({ content: '⏳ รับเงินไปแล้วครับ', flags: [MessageFlags.Ephemeral] });
        db.economy.set(interaction.user.id, (db.economy.get(interaction.user.id) || 0) + 500);
        db.lastWork.set(interaction.user.id, Date.now());
        await interaction.reply({ content: `🎉 รับเงินรายวัน 500 เหรียญแล้ว!`, flags: [MessageFlags.Ephemeral] });
    }
});

// --- 💤 AFK SYSTEM ---
const AFK_CHANNEL_NAME = 'AFK';
const AFK_TIMEOUT_MS = 30 * 60 * 1000; // 30 นาที
const afkTimers = new Map(); // เก็บ userId -> timestamp

// --- 🎙️ TEMP VOICE CHANNELS ---
const TEMP_VOICE_CATEGORY_ID = '1474311710167924758'; // ใส่ ID หมวดหมู่ที่จะให้สร้างห้องเสียงใหม่ในนี้ (ถ้ามี)
const TEMP_VOICE_CREATOR_ID = '1474311905031094399'; // ใส่ ID ห้องเสียงหลักที่คนต้องกดเข้าเพื่อสร้างห้องใหม่
const tempVoiceChannels = new Map(); // เก็บ voiceChannelId -> ownerId

client.on('voiceStateUpdate', async (oldState, newState) => {
    // ----------------------------------------------------------------
    // 1. ระบบ AFK System (ของเดิม)
    // ----------------------------------------------------------------
    if (!newState.channelId) {
        afkTimers.delete(newState.member.id);
    } else {
        const isAfk = newState.selfMute || newState.selfDeaf;
        if (isAfk) {
            if (!afkTimers.has(newState.member.id)) {
                afkTimers.set(newState.member.id, Date.now());
                console.log(`💤 ${newState.member.user.tag} เริ่ม AFK จับเวลา...`);
            }
        } else {
            if (afkTimers.has(newState.member.id)) {
                afkTimers.delete(newState.member.id);
                console.log(`✅ ${newState.member.user.tag} กลับมา Active แล้ว`);
            }
        }
    }

    // ----------------------------------------------------------------
    // 2. ระบบ Temp Voice Channels
    // ----------------------------------------------------------------

    // ก) เมื่อคนกดเข้าห้อง "สร้างห้องส่วนตัว"
    if (newState.channelId === TEMP_VOICE_CREATOR_ID && TEMP_VOICE_CREATOR_ID !== '') {
        try {
            const guild = newState.guild;
            const member = newState.member;

            // สร้างห้องเสียงใหม่
            const newChannel = await guild.channels.create({
                name: `🔊 ห้องของ ${member.user.username}`,
                type: ChannelType.GuildVoice,
                parent: TEMP_VOICE_CATEGORY_ID || newState.channel?.parentId || null,
                permissionOverwrites: [
                    {
                        id: guild.id,
                        allow: [PermissionFlagsBits.ViewChannel], // ให้ทุกคนเห็นห้อง
                    },
                    {
                        id: member.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.Connect,
                            PermissionFlagsBits.Speak,
                            PermissionFlagsBits.ManageChannels, // ให้เจ้าของจัดการห้องตัวเองได้ (เช่นเปลี่ยนชื่อ)
                            PermissionFlagsBits.MoveMembers // ให้เตะคนอื่นได้
                        ],
                    },
                ],
            });

            // ย้ายคนสร้างไปห้องใหม่
            await member.voice.setChannel(newChannel);

            // จำว่าห้องนี้สร้างโดยระบบ Temp Voice
            tempVoiceChannels.set(newChannel.id, member.id);
            console.log(`🎙️ สร้างห้องเสียงส่วนตัวใหม่: ${newChannel.name}`);

        } catch (error) {
            console.error("❌ สร้าง Temp Voice ไม่สำเร็จ:", error);
        }
    }

    // ข) เมื่อคนออกห้อง หรือย้ายห้อง เช็คว่าห้องเก่าว่างไหม และใช่ Temp Voice ไหม
    if (oldState.channelId && oldState.channelId !== newState.channelId) {
        const oldChannel = oldState.channel;

        // ถ้าเป็นห้อง Temp Voice ที่สร้างไว้ และตอนนี้ไม่มีใครอยู่แล้ว
        if (oldChannel && tempVoiceChannels.has(oldChannel.id) && oldChannel.members.size === 0) {
            try {
                await oldChannel.delete();
                tempVoiceChannels.delete(oldChannel.id);
                console.log(`🗑️ ลบห้องเสียงส่วนตัวที่ว่างแล้ว: ${oldChannel.name}`);
            } catch (error) {
                console.error("❌ ลบ Temp Voice ไม่สำเร็จ:", error);
            }
        }
    }
});

// ตรวจสอบคน AFK ทุกๆ 1 นาที (ของเดิม)
setInterval(async () => {
    const now = Date.now();
    for (const [userId, startTime] of afkTimers) {
        if (now - startTime >= AFK_TIMEOUT_MS) {
            try {
                // หา Guild (สมมติว่าบอทอยู่ Guild เดียว หรือจะ loop guild ก็ได้ แต่ที่นี่เอาแบบง่ายก่อน)
                // เนื่องจาก afkTimers เก็บ userId เราต้องหา Member Object
                // วิธีที่ดีคือเราควรเก็บ GuildId ไว้ด้วยใน Map หรือวนหาจาก client.guilds

                // เพื่อความชัวร์ วนลูปทุก Guild ที่บอทอยู่ (กรณี Multi-Server)
                for (const guild of client.guilds.cache.values()) {
                    const member = guild.members.cache.get(userId);
                    if (!member || !member.voice.channelId) continue;

                    // หาห้อง AFK
                    const afkChannel = guild.channels.cache.find(c => c.name === AFK_CHANNEL_NAME && c.type === ChannelType.GuildVoice);

                    if (afkChannel && member.voice.channelId !== afkChannel.id) {
                        await member.voice.setChannel(afkChannel);
                        afkTimers.delete(userId); // ย้ายแล้วลบ Timer ออก
                        console.log(`🚀 ย้าย ${member.user.tag} ไปห้อง ${AFK_CHANNEL_NAME} แล้ว (AFK เกิน 30 นาที)`);

                        // แจ้งเตือนในห้องเดิม (Optional)
                        // const oldChannel = guild.channels.cache.get(member.voice.channelId);
                        // if (oldChannel) oldChannel.send(`💤 ย้าย <@${userId}> ไปห้องพักเนื่องจาก AFK นานเกินไป`);
                    }
                }
            } catch (err) {
                console.error(`❌ ย้ายคน AFK พลาด: ${err.message}`);
            }
        }
    }
}, 60 * 1000); // เช็คทุก 1 นาที

client.login(process.env.DISCORD_TOKEN);
