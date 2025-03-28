// 大模型API配置
const config = {
    // 通义千问模型配置
    qwenApi: {
        endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
        apiKey: 'sk-d7773d8633db4fd9ad4b5286fd7a0738', // 请替换为您的通义千问API密钥
        model: 'qwen-omni-turbo', // 通义千问模型名称
        // 可选参数
        temperature: 0.7,
        maxTokens: 2000
    },
    // 语音识别API配置（可选功能）
    // 如果您没有语音识别API，系统将尝试使用浏览器内置的语音识别功能
    speechToTextApi: {
        provider: 'paraformer',
        apiKey: 'sk-d7773d8633db4fd9ad4b5286fd7a0738', // 请替换为实际的API密钥
        model: 'paraformer-realtime-v2'
    },
    // 语音合成API配置（可选功能）
    // 如果您没有语音合成API，系统将使用浏览器内置的语音合成功能
    textToSpeechApi: {
        provider: 'cosyvoice', // 使用通义千问CosyVoice服务
        endpoint: 'https://dashscope.aliyuncs.com/api/v1/services/audio/tts/v2', // 通义千问CosyVoice API端点
        apiKey: 'sk-d7773d8633db4fd9ad4b5286fd7a0738', // 请替换为您的通义千问API密钥
        // 语音合成参数
        model: 'cosyvoice-v1', // CosyVoice模型名称
        voice: 'xiaoyuan', // 可选值：longxiaochun（龙小春）、xiaoyuan（小源）等
        format: 'pcm_22050_16bit', // 音频格式
        // 可选的语音参数
        rate: 1.0,
        pitch: 1.0
    }
};

// 注意：要使此应用正常工作，至少需要配置llmApi部分的apiKey
// 如果您没有API密钥，可以从相应的服务提供商获取

// 导出配置
export default config;