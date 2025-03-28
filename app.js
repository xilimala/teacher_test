document.addEventListener('DOMContentLoaded', function() {
    // DOM元素
    const startInterviewBtn = document.getElementById('start-interview');
    const welcomeScreen = document.getElementById('welcome-screen');
    const interviewSession = document.getElementById('interview-session');
    const currentQuestion = document.getElementById('current-question');
    const userAnswer = document.getElementById('user-answer');
    const submitAnswerBtn = document.getElementById('submit-answer');
    const evaluationContainer = document.getElementById('evaluation-container');
    const scoreBar = document.getElementById('score-bar');
    const scoreValue = document.getElementById('score-value');
    const evaluationText = document.getElementById('evaluation-text');
    const referenceAnswer = document.getElementById('reference-answer');
    const nextQuestionBtn = document.getElementById('next-question');
    const replayQuestionBtn = document.getElementById('replay-question');
    const voiceAnswerBtn = document.getElementById('voice-answer');
    const toggleVoiceBtn = document.getElementById('toggle-voice');
    const timerElement = document.getElementById('timer');
    const voiceModal = new bootstrap.Modal(document.getElementById('voice-modal'));
    const stopRecordingBtn = document.getElementById('stop-recording');
    const recordingMessage = document.getElementById('recording-message');
    
    // 导入API服务和DashScope
    Promise.all([
        import("./api-service.js"),
        import("./dashscope.js")
    ])
        .then(([apiModule, dashscopeModule]) => {
            const apiService = apiModule.default;
            const dashscope = dashscopeModule.default;
            
            // 设置DashScope API密钥（如果配置中有）
            if (apiService && apiService.speechToTextConfig && apiService.speechToTextConfig.provider === 'aliyun') {
                window.dashscopeApiKey = apiService.speechToTextConfig.apiKey;
            }
            
            initApp(apiService);
        })
        .catch(error => {
            console.error('加载API服务失败:', error);
            alert('加载API服务失败，将使用模拟数据。');
            initApp(null);
        });
    
    // 初始化应用
    function initApp(apiService) {
        // 状态变量
        let currentInterviewType = '';
        let currentSubject = '';
        let currentDifficulty = '';
        let includeHotTopics = true;
        let questions = [];
        let currentQuestionIndex = 0;
        let timerInterval = null;
        let timerSeconds = 0;
        let isVoiceModeEnabled = false;
        let recognition = null;
        let mediaRecorder = null;
        let audioChunks = [];
        let audioBlob = null;
        let isRecording = false;
        
        // 初始化语音识别（如果浏览器支持）
        function initSpeechRecognition() {
            if ('webkitSpeechRecognition' in window) {
                recognition = new webkitSpeechRecognition();
                recognition.continuous = true;
                recognition.interimResults = true;
                recognition.lang = 'zh-CN';
                
                recognition.onresult = function(event) {
                    let interimTranscript = '';
                    let finalTranscript = '';
                    
                    for (let i = event.resultIndex; i < event.results.length; ++i) {
                        if (event.results[i].isFinal) {
                            finalTranscript += event.results[i][0].transcript;
                        } else {
                            interimTranscript += event.results[i][0].transcript;
                        }
                    }
                    
                    if (finalTranscript) {
                        userAnswer.value += finalTranscript + ' ';
                    }
                };
                
                recognition.onerror = function(event) {
                    console.error('语音识别错误:', event.error);
                    stopRecording();
                };
                
                return true;
            } else {
                return false;
            }
        }
        
        // 初始化媒体录制（用于API语音识别）
        function initMediaRecorder() {
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                navigator.mediaDevices.getUserMedia({ audio: true })
                    .then(stream => {
                        // 设置MediaRecorder的MIME类型和比特率
                        const options = {
                            mimeType: 'audio/webm',
                            audioBitsPerSecond: 128000
                        };
                        
                        try {
                            mediaRecorder = new MediaRecorder(stream, options);
                        } catch (e) {
                            // 如果不支持webm格式，尝试其他格式
                            console.warn('WebM格式不受支持，尝试其他格式');
                            mediaRecorder = new MediaRecorder(stream);
                        }
                        
                        mediaRecorder.ondataavailable = function(event) {
                            audioChunks.push(event.data);
                        };
                        
                        mediaRecorder.onstop = async function() {
                            // 获取实际的MIME类型
                            const mimeType = mediaRecorder.mimeType || 'audio/webm';
                            audioBlob = new Blob(audioChunks, { type: mimeType });
                            audioChunks = [];
                            
                            // 如果有API服务，则使用API进行语音识别
                            if (apiService) {
                                try {
                                    recordingMessage.textContent = "正在处理语音...";
                                    console.log(`开始语音识别，音频格式: ${audioBlob.type}，大小: ${audioBlob.size} 字节`);
                                    const text = await apiService.speechToText(audioBlob);
                                    console.log(`语音识别成功，识别结果: ${text}`);
                                    userAnswer.value += text + ' ';
                                    voiceModal.hide();
                                } catch (error) {
                                    console.error('API语音识别失败:', error);
                                    // 提取错误信息中的具体原因
                                    let errorMessage = '语音识别失败，请重试或手动输入。';
                                    if (error.message && error.message.includes('API配置')) {
                                        errorMessage = '语音识别服务配置有误，请检查API密钥和模型设置。';
                                    } else if (audioBlob.size > 10 * 1024 * 1024) {
                                        errorMessage = '语音文件过大，请缩短录音时间后重试。';
                                    }
                                    alert(errorMessage);
                                    voiceModal.hide();
                                }
                            } else {
                                // 如果没有API服务，则使用浏览器内置语音识别
                                if (!recognition && !initSpeechRecognition()) {
                                    alert('您的浏览器不支持语音识别功能，请手动输入。');
                                }
                                voiceModal.hide();
                            }
                        };
                        
                        return true;
                    })
                    .catch(error => {
                        console.error('获取麦克风权限失败:', error);
                        return false;
                    });
            } else {
                return false;
            }
        }
        
        // 开始录音
        function startRecording() {
            if (apiService && mediaRecorder) {
                // 使用MediaRecorder录制音频用于API语音识别
                audioChunks = [];
                // 设置较短的时间片段，以便更好地处理音频
                mediaRecorder.start(100); // 每100ms触发一次ondataavailable事件
                isRecording = true;
                recordingMessage.textContent = "正在录音...";
                voiceModal.show();
                console.log('开始录音，使用格式:', mediaRecorder.mimeType);
            } else if (!recognition && !initSpeechRecognition()) {
                alert('您的浏览器不支持语音识别功能，请使用Chrome浏览器。');
                return;
            } else {
                // 使用浏览器内置语音识别
                isRecording = true;
                recognition.start();
                voiceModal.show();
            }
        }
        
        // 停止录音
        function stopRecording() {
            if (isRecording) {
                isRecording = false;
                
                if (apiService && mediaRecorder && mediaRecorder.state === 'recording') {
                    mediaRecorder.stop();
                } else if (recognition) {
                    recognition.stop();
                    voiceModal.hide();
                }
            }
        }
        
        // 语音合成朗读文本
        async function speakText(text) {
            if (apiService) {
                try {
                    // 使用API进行语音合成
                    const audioBlob = await apiService.textToSpeech(text);
                    const audioUrl = URL.createObjectURL(audioBlob);
                    const audio = new Audio(audioUrl);
                    audio.play();
                } catch (error) {
                    console.error('API语音合成失败:', error);
                    // 失败时回退到浏览器内置语音合成
                    fallbackSpeakText(text);
                }
            } else {
                // 使用浏览器内置语音合成
                fallbackSpeakText(text);
            }
        }
        
        // 浏览器内置语音合成（作为备用）
        function fallbackSpeakText(text) {
            if (window.speechSynthesis) {
                // 取消之前的语音
                window.speechSynthesis.cancel();
                
                const utterance = new SpeechSynthesisUtterance(text);
                utterance.lang = 'zh-CN';
                utterance.rate = 1.0;
                utterance.pitch = 1.0;
                
                window.speechSynthesis.speak(utterance);
            }
        }
        
        // 切换语音模式
        toggleVoiceBtn.addEventListener('click', function() {
            isVoiceModeEnabled = !isVoiceModeEnabled;
            this.innerHTML = isVoiceModeEnabled ? '🔇 关闭语音' : '🎤 语音模式';
            
            if (isVoiceModeEnabled && currentQuestion.textContent !== '问题将在这里显示...') {
                speakText(currentQuestion.textContent);
            }
        });
        
        // 重听问题
        replayQuestionBtn.addEventListener('click', function() {
            if (currentQuestion.textContent !== '问题将在这里显示...') {
                speakText(currentQuestion.textContent);
            }
        });
        
        // 语音回答
        voiceAnswerBtn.addEventListener('click', startRecording);
        
        // 停止录音
        stopRecordingBtn.addEventListener('click', stopRecording);
        
        // 更新计时器显示
        function updateTimer() {
            const minutes = Math.floor(timerSeconds / 60);
            const seconds = timerSeconds % 60;
            timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            timerSeconds++;
        }
        
        // 开始计时器
        function startTimer() {
            timerSeconds = 0;
            updateTimer();
            timerInterval = setInterval(updateTimer, 1000);
        }
        
        // 停止计时器
        function stopTimer() {
            clearInterval(timerInterval);
        }
        
        // 获取面试问题
        async function fetchInterviewQuestions() {
            if (apiService) {
                // 使用API服务获取问题
                return await apiService.generateInterviewQuestions({
                    interviewType: currentInterviewType,
                    subject: currentSubject,
                    difficulty: currentDifficulty,
                    includeHotTopics: includeHotTopics
                });
            } else {
                // 使用模拟数据
                // 模拟API调用延迟
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // 模拟问题数据
                return [
                    {
                        question: "请谈谈你对双减政策的理解，以及作为一名教师，你将如何在教学中落实这一政策？",
                        reference: "双减政策是指减轻义务教育阶段学生作业负担和校外培训负担。作为教师，我会：1）优化课堂教学，提高课堂效率；2）设计有针对性的分层作业；3）开展丰富多彩的校内课后服务；4）加强与家长沟通，形成教育合力；5）注重学生综合素质和创新能力培养，而非单纯追求分数。",
                        type: 5 // 综合分析类
                    },
                    {
                        question: "如果你的班级有一位学生长期沉迷手机游戏，影响了学习，作为班主任，你会采取哪些措施？",
                        reference: "我会：1）私下与学生交流，了解沉迷游戏的原因；2）与家长沟通，共同制定监督方案；3）帮助学生制定合理的作息计划；4）引导学生参与有趣的课外活动，发展健康兴趣爱好；5）开展班会活动，讨论合理使用电子设备的话题；6）必要时寻求学校心理咨询老师的帮助。",
                        type: 6 // 教育教学类
                    },
                    {
                        question: "结合新课标理念，谈谈你如何在教学中培养学生的核心素养？",
                        reference: "新课标强调培养学生的核心素养。我会：1）设计情境化、问题化的教学内容，培养学生解决实际问题的能力；2）采用项目学习、探究学习等教学方法，促进学生主动建构知识；3）重视学科内容与现实生活的联系，增强学习的实用性；4）关注学生个体差异，实施差异化教学；5）运用多元评价方式，全面反映学生发展状况；6）渗透学科思想方法，培养学生思维品质。",
                        type: 6 // 教育教学类
                    },
                    {
                        question: "近年来，人工智能技术在教育领域的应用日益广泛。请谈谈你对AI与教育融合发展的看法，以及作为教师应如何应对这一变革？",
                        reference: "AI与教育融合是大势所趋：1）AI可以提供个性化学习路径，精准分析学生学习数据；2）可以减轻教师的常规性工作负担，让教师有更多精力关注学生发展；3）作为教师，我会积极学习AI相关知识和技能，将AI工具合理融入教学设计；4）注重培养学生不可替代的能力，如创造力、批判性思维、情感表达等；5）保持教育人文关怀本质，AI是工具而非替代者；6）让学生正确认识和使用AI工具，培养数字素养和信息辨别能力。",
                        type: 7 // 时事政治类
                    },
                    {
                        question: "作为一名新教师，如何处理与家长的沟通与合作关系？请结合具体案例说明。",
                        reference: "处理与家长的沟通合作：1）建立多元沟通渠道，如家长会、个别交流、线上群组等；2）沟通时保持专业、客观、尊重的态度；3）定期向家长反馈学生在校表现，不仅关注学习成绩，也关注行为习惯、情绪状态等；4）针对问题学生，与家长共同制定改进计划；5）引导家长树立科学的教育观念；6）案例：曾有一位学生作业经常不完成，通过与家长沟通了解到家庭学习环境问题，共同调整后，学生状态明显改善。",
                        type: 2 // 人际沟通类
                    }
                ];
            }
        }
        
        // 评价用户回答
        async function evaluateAnswer(question, userAnswer) {
            if (apiService) {
                // 使用API服务评价回答
                return await apiService.evaluateAnswer({
                    question: question,
                    userAnswer: userAnswer,
                    interviewType: currentInterviewType,
                    subject: currentSubject
                });
            } else {
                // 使用模拟数据
                // 模拟API调用延迟
                await new Promise(resolve => setTimeout(resolve, 1500));
                
                // 简单评分逻辑（实际应用中应由AI模型评分）
                const score = Math.floor(Math.random() * 30) + 70; // 70-99分
                
                // 模拟评价内容
                let evaluation = '';
                if (score >= 90) {
                    evaluation = "您的回答非常出色！论述全面，条理清晰，能够结合教育理论和实践经验，并有自己的见解。";
                } else if (score >= 80) {
                    evaluation = "您的回答很好，内容较为全面，有一定的理论支撑，但在某些方面还可以进一步深入。";
                } else {
                    evaluation = "您的回答基本合格，但内容有待丰富，建议加强教育理论学习，并结合实际案例进行分析。";
                }
                
                return {
                    score: score,
                    evaluation: evaluation
                };
            }
        }
        
        // 显示问题
        function displayQuestion(question) {
            currentQuestion.textContent = question;
            userAnswer.value = '';
            
            // 显示问题类型
            const questionTypeElement = document.getElementById('question-type');
            const questionType = questions[currentQuestionIndex].type || 0;
            let typeText = '未分类';
            
            // 根据问题类型设置显示文本
            switch(questionType) {
                case 1: typeText = '自我认知类'; break;
                case 2: typeText = '人际沟通类'; break;
                case 3: typeText = '组织管理类'; break;
                case 4: typeText = '应急应变类'; break;
                case 5: typeText = '综合分析类'; break;
                case 6: typeText = '教育教学类'; break;
                case 7: typeText = '时事政治类'; break;
                default: typeText = '未分类';
            }
            
            questionTypeElement.textContent = typeText;
            
            if (isVoiceModeEnabled) {
                speakText(question);
            }
        }
        
        // 显示评价结果
        function displayEvaluation(result, referenceAnswerText) {
            evaluationContainer.classList.remove('d-none');
            scoreBar.style.width = `${result.score}%`;
            scoreValue.textContent = result.score;
            evaluationText.textContent = result.evaluation;
            referenceAnswer.textContent = referenceAnswerText;
            
            // 添加动画效果
            evaluationContainer.classList.add('fade-in');
            
            // 如果启用了语音模式，朗读评价
            if (isVoiceModeEnabled) {
                speakText(`您的得分是${result.score}分。${result.evaluation}`);
            }
        }
        
        // 开始面试
        startInterviewBtn.addEventListener('click', async function() {
            // 获取面试设置
            currentInterviewType = document.getElementById('interview-type').value;
            currentSubject = document.getElementById('subject').value;
            currentDifficulty = document.getElementById('difficulty').value;
            includeHotTopics = document.getElementById('hot-topics').checked;
            
            // 显示加载状态
            startInterviewBtn.disabled = true;
            startInterviewBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> 加载中...';
            
            try {
                // 记录请求参数
                console.log('请求面试问题，参数:', {
                    interviewType: currentInterviewType,
                    subject: currentSubject,
                    difficulty: currentDifficulty,
                    includeHotTopics: includeHotTopics
                });
                
                // 获取面试问题
                questions = await fetchInterviewQuestions();
                
                // 记录返回的问题数据
                console.log('获取到的面试问题:', questions);
                
                if (questions && questions.length > 0) {
                    // 隐藏欢迎屏幕，显示面试会话
                    welcomeScreen.classList.add('d-none');
                    interviewSession.classList.remove('d-none');
                    evaluationContainer.classList.add('d-none');
                    
                    // 显示第一个问题
                    currentQuestionIndex = 0;
                    displayQuestion(questions[currentQuestionIndex].question);
                    
                    // 开始计时
                    startTimer();
                } else {
                    throw new Error('返回的问题列表为空');
                }
            } catch (error) {
                console.error('获取面试问题失败:', error);
                // 记录更详细的错误信息
                if (error.response) {
                    console.error('API响应状态:', error.response.status);
                    console.error('API响应数据:', error.response.data);
                }
                // 显示更友好的错误提示
                alert(`获取面试问题失败: ${error.message || '请检查网络连接或API配置'}`);
            } finally {
                // 恢复按钮状态
                startInterviewBtn.disabled = false;
                startInterviewBtn.innerHTML = '开始面试';
            }
        });
        
        // 提交答案
        submitAnswerBtn.addEventListener('click', async function() {
            if (userAnswer.value.trim() === '') {
                alert('请输入您的回答');
                return;
            }
            
            // 禁用提交按钮
            submitAnswerBtn.disabled = true;
            submitAnswerBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> 评价中...';
            
            try {
                // 停止计时
                stopTimer();
                
                // 获取当前问题和用户回答
                const currentQ = questions[currentQuestionIndex].question;
                const answer = userAnswer.value;
                
                // 评价回答
                const result = await evaluateAnswer(currentQ, answer);
                
                // 显示评价结果
                displayEvaluation(result, questions[currentQuestionIndex].reference);
            } catch (error) {
                console.error('评价回答失败:', error);
                alert('评价回答失败，请重试。');
            } finally {
                // 恢复按钮状态
                submitAnswerBtn.disabled = false;
                submitAnswerBtn.innerHTML = '提交回答';
            }
        });
        
        // 下一题
        nextQuestionBtn.addEventListener('click', function() {
            currentQuestionIndex++;
            
            if (currentQuestionIndex < questions.length) {
                // 显示下一题
                displayQuestion(questions[currentQuestionIndex].question);
                
                // 隐藏评价区域
                evaluationContainer.classList.add('d-none');
                
                // 重新开始计时
                startTimer();
            } else {
                // 所有问题已回答完毕
                alert('恭喜您完成了所有面试问题！');
                
                // 返回欢迎屏幕
                interviewSession.classList.add('d-none');
                welcomeScreen.classList.remove('d-none');
                evaluationContainer.classList.add('d-none');
            }
        });
        
        // 初始化媒体录制器（用于API语音识别）
        if (apiService) {
            initMediaRecorder();
        }
    }
});