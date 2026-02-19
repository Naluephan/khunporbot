const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function testModels() {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    // Models found in the previous list verification
    const modelsToTest = [
        "gemini-2.0-flash",           // Current one (Failed)
        "gemini-2.0-flash-lite-001",  // Lite version
        "gemini-flash-latest",        // Likely 1.5 Flash
        "gemini-pro",                 // Standard Pro
        "gemini-1.5-flash"            // Explicit 1.5 Flash (check again)
    ];

    console.log("Testing models for availability and quota...");

    for (const modelName of modelsToTest) {
        console.log(`\n--- Testing ${modelName} ---`);
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent("Hello, just a quick test.");
            const response = await result.response;
            console.log(`✅ SUCCESS: ${modelName}`);
            // If we found a working one, we might want to stop, but let's see all options.
        } catch (error) {
            if (error.message.includes('429')) {
                console.log(`❌ QUOTA EXCEEDED (429): ${modelName}`);
            } else if (error.message.includes('404')) {
                console.log(`❌ NOT FOUND (404): ${modelName}`);
            } else {
                console.log(`❌ ERROR: ${modelName} - ${error.message}`);
            }
        }
    }
}

testModels();
