require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function testKey() {
    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        // Using a model found in the list
        const modelName = "gemini-2.0-flash";
        console.log(`Testing with model: ${modelName}`);

        const model = genAI.getGenerativeModel({ model: modelName });

        const result = await model.generateContent("Hello, are you working?");
        const response = await result.response;
        console.log("Response:", response.text());
        console.log("✅ Model verified successfully.");
    } catch (error) {
        console.error("❌ Error:", error.message);
    }
}

testKey();
