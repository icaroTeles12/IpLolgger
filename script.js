// =================================================================
// FUNÇÕES AUXILIARES
// =================================================================

/** Gera um código curto alfanumérico único para o link. */
function generateShortCode(length = 6) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

/** * Obtém a localização GPS do usuário (requer permissão do usuário). */
function getGeolocation() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            return resolve({ error: "Geolocation não suportada" });
        }
        
        const options = {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0
        };

        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    latitude: position.coords.latitude.toFixed(6),
                    longitude: position.coords.longitude.toFixed(6),
                    accuracy: `${position.coords.accuracy.toFixed(2)}m`
                });
            },
            (error) => {
                // Erro 1: Permissão negada, 2: Posição indisponível, 3: Timeout
                resolve({ error: `GPS Negado ou Falha (${error.code})` });
            },
            options
        );
    });
}

/** * Obtém IP e detalhes de geolocalização (Cidade, País, ISP, Fuso, Org) usando ip-api.com.
 */
async function getIPDetails() {
    try {
        const response = await fetch('http://ip-api.com/json/?fields=status,message,country,regionName,city,isp,query,timezone,org');
        const data = await response.json();
        
        if (data.status === 'success') {
            return {
                ip: data.query,
                country: data.country,
                region: data.regionName,
                city: data.city,
                isp: data.isp,
                timezone: data.timezone,
                org: data.org || 'N/A'
            };
        }
        return { ip: 'Falha na coleta de IP', country: 'N/A', region: 'N/A', city: 'N/A', isp: 'N/A', timezone: 'N/A', org: 'N/A' };

    } catch (error) {
        console.error("Erro ao obter detalhes do IP:", error);
        return { ip: 'Erro de Rede', country: 'N/A', region: 'N/A', city: 'N/A', isp: 'N/A', timezone: 'N/A', org: 'N/A' };
    }
}

/** * Analisa a string User Agent para obter o Navegador e o SO de forma legível.
 */
function parseUserAgent(userAgent) {
    let browser = 'Desconhecido';
    let os = 'Desconhecido';

    // Detecção de OS (Simplificado)
    if (userAgent.includes('Win')) os = 'Windows';
    else if (userAgent.includes('Mac')) os = 'macOS';
    else if (userAgent.includes('Linux')) os = 'Linux';
    else if (userAgent.includes('Android')) os = 'Android';
    else if (userAgent.includes('iOS') || userAgent.includes('iPhone')) os = 'iOS';
    else if (userAgent.includes('X11')) os = 'Unix/X11';

    // Detecção de Navegador (Simplificado)
    if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) browser = 'Chrome';
    else if (userAgent.includes('Firefox')) browser = 'Firefox';
    else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) browser = 'Safari';
    else if (userAgent.includes('Edg')) browser = 'Edge';
    else if (userAgent.includes('Trident') || userAgent.includes('MSIE')) browser = 'IE';

    return { browser, os };
}

/** * Coleta detalhes da tela e do idioma do dispositivo. */
function getScreenDetails() {
    return {
        resolution: `${screen.width}x${screen.height}`,
        colorDepth: `${screen.colorDepth} bits`,
        language: navigator.language
    };
}


// =================================================================
// FUNÇÕES DE MANIPULAÇÃO DE DADOS (JSON E LIMPEZA)
// =================================================================

/** * Compila todos os dados do localStorage em um único objeto JSON e força o download.
 */
function exportLogsToJsonFile() {
    const allLinksData = {};
    let dataFound = false;

    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        
        try {
            const linkData = JSON.parse(localStorage.getItem(key));

            if (linkData && linkData.longUrl && Array.isArray(linkData.visits)) {
                allLinksData[key] = linkData;
                dataFound = true;
            }
        } catch (e) {
            console.error(`Erro ao parsear key ${key} do localStorage:`, e);
        }
    }

    if (!dataFound) {
        alert("Não há dados de rastreamento para exportar.");
        return;
    }

    const jsonString = JSON.stringify(allLinksData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    
    a.href = url;
    a.download = `log_rastreador_${new Date().toISOString().slice(0, 10)}.json`;
    
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    alert(`Dados exportados com sucesso para o arquivo ${a.download}!`);
}

/** * Limpa todos os logs de links rastreados do localStorage.
 */
function clearAllLogs() {
    if (!confirm("Tem certeza que deseja limpar TODOS os logs de rastreamento? Esta ação não pode ser desfeita.")) {
        return;
    }

    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        try {
            const data = JSON.parse(localStorage.getItem(key));
            // Remove apenas as chaves que correspondem ao nosso formato de log de link
            if (data && data.longUrl && Array.isArray(data.visits)) {
                keysToRemove.push(key);
            }
        } catch (e) {
            // Ignora chaves corrompidas ou não relacionadas
        }
    }

    keysToRemove.forEach(key => {
        localStorage.removeItem(key);
    });

    alert(`${keysToRemove.length} logs de link removidos com sucesso.`);
    updateLogDisplay(); // Atualiza o dashboard
}


// =================================================================
// DASHBOARD: EXIBIÇÃO DE LOGS DE ACESSO COM GEOMAP
// =================================================================

/** * Lê todos os links e logs do localStorage e renderiza o dashboard. */
function updateLogDisplay() {
    const dashboard = document.getElementById('logsDashboard');
    dashboard.innerHTML = ''; 

    let linkFound = false;
    const baseUrl = window.location.href.split('#')[0];

    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        
        try {
            const linkData = JSON.parse(localStorage.getItem(key));

            if (linkData && linkData.longUrl && Array.isArray(linkData.visits)) {
                linkFound = true;
                
                const entry = document.createElement('div');
                entry.className = 'log-entry';

                let html = `
                    <h3>Link: <strong>${baseUrl}#${key}</strong></h3>
                    <p>URL Longa: <a href="${linkData.longUrl}" target="_blank">${linkData.longUrl}</a></p>
                    <p><strong>Total de Acessos: ${linkData.visits.length}</strong></p>
                `;
                
                if (linkData.visits.length > 0) {
                    html += '<h4>Logs de Visita Detalhados:</h4>';
                    linkData.visits.reverse().forEach((visit, index) => { 
                        const date = new Date(visit.timestamp).toLocaleString('pt-BR');
                        
                        const gpsString = visit.gps.error 
                            ? `<span class="gps-error">${visit.gps.error} (Localização GPS Negada)</span>`
                            : `Lat: ${visit.gps.latitude}, Long: ${visit.gps.longitude} (Acurácia: ${visit.gps.accuracy})`;

                        // --- CRIAÇÃO DO LINK PARA O MAPA ---
                        let mapLinkHtml = '';
                        if (!visit.gps.error) {
                            const mapUrl = `http://googleusercontent.com/maps.google.com/5{visit.gps.latitude},${visit.gps.longitude}`;
                            mapLinkHtml = `<a href="${mapUrl}" target="_blank" class="map-link">📍 Ver GPS Preciso</a>`;
                        } else {
                            const ipMapUrl = `http://googleusercontent.com/maps.google.com/5{encodeURIComponent(visit.ipDetails.city + ', ' + visit.ipDetails.country)}`;
                            mapLinkHtml = `<a href="${ipMapUrl}" target="_blank" class="map-link">🌐 Ver Localização Estimada (IP)</a>`;
                        }
                        // ------------------------------------
                        
                        // Referrer (Site de Origem)
                        const referrer = visit.referrer || 'Direto / Desconhecido';
                        

                        html += `
                            <div class="visit-log">
                                <p>#${linkData.visits.length - index} em <strong>${date}</strong></p>
                                
                                <h4>🔗 Origem do Clique</h4>
                                <p><strong>Site de Origem (Referer):</strong> ${referrer}</p>

                                <h4>🗺️ Detalhes da Localização</h4>
                                <p><strong>IP Público:</strong> ${visit.ipDetails.ip}</p>
                                <p><strong>Localização Estimada:</strong> ${visit.ipDetails.city}, ${visit.ipDetails.region}, ${visit.ipDetails.country} (Fuso: ${visit.ipDetails.timezone})</p>
                                <p><strong>Provedor/Org:</strong> ${visit.ipDetails.isp} / ${visit.ipDetails.org}</p>
                                <p><strong>Localização GPS Precisa:</strong> ${gpsString} ${mapLinkHtml}</p>
                                
                                <h4>💻 Detalhes do Dispositivo</h4>
                                <p><strong>SO:</strong> ${visit.device.os} (Idioma: ${visit.screenDetails.language})</p>
                                <p><strong>Navegador:</strong> ${visit.device.browser}</p>
                                <p><strong>Resolução de Tela:</strong> ${visit.screenDetails.resolution}</p>
                            </div>
                        `;
                    });
                } else {
                    html += '<p>Nenhum log de acesso ainda.</p>';
                }

                entry.innerHTML = html;
                dashboard.appendChild(entry);
            }
        } catch (e) {
            console.error("Erro ao carregar log:", e);
        }
    }

    if (!linkFound) {
        dashboard.innerHTML = '<p id="noLinksMessage">Nenhum link gerado ainda. Crie um acima!</p>';
    }
}


// =================================================================
// 1. LÓGICA DE GERAÇÃO DE LINK
// =================================================================

document.getElementById('generateBtn').addEventListener('click', () => {
    const longUrlInput = document.getElementById('longUrl');
    const longUrl = longUrlInput.value.trim();

    if (!longUrl || !longUrl.match(/^https?:\/\/.+/)) {
        alert('Por favor, insira uma URL válida que comece com http:// ou https://.');
        return;
    }

    const shortCode = generateShortCode();
    
    const linkMap = {
        longUrl: longUrl,
        visits: [] 
    };

    localStorage.setItem(shortCode, JSON.stringify(linkMap));

    const shortLinkElement = document.getElementById('shortLink');
    const resultContainer = document.getElementById('resultContainer');
    
    const baseUrl = window.location.href.split('#')[0];
    const finalShortLink = baseUrl + '#' + shortCode; 
    
    shortLinkElement.href = finalShortLink;
    shortLinkElement.textContent = finalShortLink;
    resultContainer.classList.remove('hidden');

    alert(`Link gerado com sucesso! Código: ${shortCode}`);
    
    updateLogDisplay();
});


// =================================================================
// 2. LÓGICA DE REDIRECIONAMENTO E RASTREAMENTO AVANÇADO
// =================================================================

async function handleRedirectionAndTracking() {
    const hash = window.location.hash;
    const logsSection = document.querySelector('.logs-section'); 

    if (hash.length > 1) {
        // Esconde o dashboard para o visitante (Defesa contra visualização de logs)
        if (logsSection) {
            logsSection.style.display = 'none'; 
        }

        const shortCode = hash.substring(1); 
        const linkDataString = localStorage.getItem(shortCode);
        
        if (linkDataString) {
            let linkData = JSON.parse(linkDataString);

            // Coleta de dados avançada (IP/Geoloc e GPS) em paralelo
            const [ipDetails, gpsLocation] = await Promise.all([
                getIPDetails(),
                getGeolocation() 
            ]);

            // Coleta de detalhes do dispositivo e da origem
            const deviceDetails = parseUserAgent(navigator.userAgent);
            const screenDetails = getScreenDetails();
            const referrer = document.referrer; // Site de onde o usuário veio
            
            // Cria e salva o objeto de log de visita
            const newVisit = {
                timestamp: new Date().toISOString(),
                ipDetails: ipDetails, 
                gps: gpsLocation, 
                device: deviceDetails,
                screenDetails: screenDetails, // Novo: Resolução/Idioma
                referrer: referrer // Novo: Site de origem
            };

            linkData.visits.push(newVisit);
            localStorage.setItem(shortCode, JSON.stringify(linkData));
            
            console.log("--- NOVO RASTREAMENTO EFETUADO ---");
            
            // Redireciona o usuário
            window.location.replace(linkData.longUrl);
        } else {
            alert(`Link não encontrado para o código: ${shortCode}`);
            window.location.hash = ''; 
        }
    } else {
        // Se não houver hash, carrega o dashboard de logs
        updateLogDisplay();
        attachDashboardListeners(); // Anexa ouvintes dos botões do dashboard
    }
}

// =================================================================
// FUNÇÕES DE BOTÕES DE DASHBOARD E INICIALIZAÇÃO
// =================================================================

function attachDashboardListeners() {
    // 1. Botão Exportar JSON
    const exportBtn = document.getElementById('exportJsonBtn');
    if (exportBtn) {
        // Garantindo que só haja um ouvinte para evitar execuções duplicadas
        exportBtn.removeEventListener('click', exportLogsToJsonFile);
        exportBtn.addEventListener('click', exportLogsToJsonFile);
    }
    
    // 2. Botão Limpar Logs
    const clearBtn = document.getElementById('clearLogsBtn');
    if (clearBtn) {
        clearBtn.removeEventListener('click', clearAllLogs);
        clearBtn.addEventListener('click', clearAllLogs);
    }
}


document.getElementById('copyBtn').addEventListener('click', () => {
    const shortLinkElement = document.getElementById('shortLink');
    
    navigator.clipboard.writeText(shortLinkElement.href).then(() => {
        alert('Link Copiado para a área de transferência!');
    }).catch(err => {
        // Fallback
        const tempInput = document.createElement('input');
        tempInput.value = shortLinkElement.href;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand('copy');
        document.body.removeChild(tempInput);
        alert('Link Copiado (Método alternativo)!');
    });
});


// Inicia o programa ao carregar a página
document.addEventListener('DOMContentLoaded', handleRedirectionAndTracking);