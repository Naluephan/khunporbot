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
const aiModel = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

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

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // --- 🤖 AI CHAT (Tag or !ask) ---
    if (message.content.startsWith('!ask') || message.mentions.has(client.user)) {
        const query = message.content.replace('!ask', '').replace(/<@!?[0-9]+>/, '').trim();
        if (!query) return message.reply('❓ ถามอะไรหน่อยสิครับ');

        await message.channel.sendTyping();
        try {
            const result = await aiModel.generateContent(query);
            const response = result.response.text();

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
            if (error.message.includes('429')) {
                return message.reply('⏳ ตอนนี้ AI ใช้งานหนักเกินลิมิต โปรดรอสักครู่แล้วลองใหม่ครับ');
            }
            message.reply('❌ เกิดข้อผิดพลาดในการเชื่อมต่อกับ AI');
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
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

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

client.on('voiceStateUpdate', (oldState, newState) => {
    // ถ้าไม่ได้อยู่ในช่องเสียง ให้ลบ Timer
    if (!newState.channelId) {
        afkTimers.delete(newState.member.id);
        return;
    }

    // เช็คว่า Self-Mute หรือ Self-Deafen หรือไม่
    const isAfk = newState.selfMute || newState.selfDeaf;

    if (isAfk) {
        // ถ้าเริ่ม AFK และยังไม่มี Timer ให้เริ่มจับเวลา
        if (!afkTimers.has(newState.member.id)) {
            afkTimers.set(newState.member.id, Date.now());
            console.log(`💤 ${newState.member.user.tag} เริ่ม AFK จับเวลา...`);
        }
    } else {
        // ถ้ากลับมาปกติ (เลิก Mute/Deafen) ให้ลบ Timer
        if (afkTimers.has(newState.member.id)) {
            afkTimers.delete(newState.member.id);
            console.log(`✅ ${newState.member.user.tag} กลับมา Active แล้ว`);
        }
    }
});

// ตรวจสอบคน AFK ทุกๆ 1 นาที
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
