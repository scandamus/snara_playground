'use strict';

const WebSocket = require('ws');
require('dotenv').config();

const HOST = 'localhost';

class Storage {
	constructor() {
		this.obj = {};
	}
	getItem(name) {
		return this.obj[name] || null;
	}
	setItem(name, value) {
		this.obj[name] = value;
	}
	removeItem(name) {
		this.obj[name] = null;
	}
	clear() {
		this.obj = {};
	}
};

const sessionStorage = new Storage();

const getToken = (nameToken) => {
	const token = sessionStorage.getItem(nameToken);
	if (token === null) {
		return null;//未ログイン
	}
	if (!token) {//todo:test (undefinedなど)
		throw new Error(`${nameToken} is invalid`);
	}
	return token;
}

const refreshAccessToken = async () => {
	const refreshToken = getToken('refreshToken');
	console.log(`refreshToken: ${refreshToken}`);
	// ネットワークエラー、サーバーエラー、ストレージエラーの例外に対応
	try {
		// SimpleJWTのリフレッシュトークン発行はbodyにrefreshを渡す仕様
		const response = await fetch('https://localhost/token/refresh/', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				'refresh': refreshToken
			})
		});
		if (response.ok) {
			const refreshData = await response.json();
			console.log(`refreshData: `, refreshData);
			sessionStorage.setItem('accessToken', refreshData.access);
			sessionStorage.setItem('refreshToken', refreshData.refresh);
			console.log(`Successfully token refreshed: ${refreshData.access}`);
			return refreshData.access;
		}
		// TODO: logout処理に飛ばす
		console.error('Failed to refresh token, server responded with: ', response.status);
		return null;
	} catch (error) {
		console.error('Error occured while refreshing token: ', error);
		return null;
	}
}

const isTokenExpired = (token) => {
	try {
		const payloadBase64 = token.split('.')[1];
		const decodePayload = JSON.parse(atob(payloadBase64));
		const exp = decodePayload.exp;
		const currentUnixTime = Math.floor(Date.now() / 1000);
		return exp < currentUnixTime;
	} catch (e) {
		console.log('Decode token failed: ', e);
		return true;
	}
}

const getValidToken = async (nameToken) => {
	let myToken = getToken(nameToken);
	if (myToken == null) {
		console.log('No token found.');
		return { token: null, error: 'No token found' };
	}
	if (!isTokenExpired(myToken)) {
		return { token: myToken, error: null };
	}
	console.log('token expired');
	const refreshedToken = await refreshAccessToken();
	if (!refreshedToken) {
		console.error('Failed to refresh token.');
		return { token: null, error: 'Failed to refresh token' };
	}
	return { token: refreshedToken, error: (!refreshedToken ? null : 'No access token though refresh is success')};
}

const initToken = async () => {
	console.log('initToken in');
	try {
		const tokenResult = await getValidToken('accessToken');
		console.log('tokenResult: ', tokenResult);
		if (tokenResult.token) {
			console.log('accessToken: ', tokenResult.token);
			return tokenResult;
		} else {
			console.error('Token error: ', tokenResult.error);
			return false;
		}
	} catch (error) {
		console.error('Error user page initToken: ', error);
	}
}

////

class WebSocketManager {
	constructor() {
		this.sockets = {};
		this.messageHandlers = {};
	}

	async openWebSocket(containerId, messageHandler) {
		return new Promise(async (resolve, reject) => {
			if (this.sockets[containerId] && this.sockets[containerId].readyState) {
				console.log(`WebSocket for ${containerId} is already open.`);
				resolve(this.sockets[containerId]);
				return;
			}

			const accessTokenResult = await getValidToken('accessToken');
			if (!accessTokenResult.token) {
				console.error('Access token is missing or invalid');
				reject('Access token is missing or invalid.');
				return;
			}

			const url = 'wss://'
				+ HOST
				+ '/ws/'
				+ containerId
				+ '/';

			console.log(`new WebSocket('${url}')`);
			const socket = new WebSocket(url);

			// 接続したら必ずAccessTokenを送る
			socket.onopen = () => {
				console.log(`WebSocket for ${containerId} is open now.`);
				this.sockets[containerId] = socket;
				this.messageHandlers[containerId] = messageHandler || this.defaultMessageHandler(this, containerId);
				if (containerId === 'lounge') {
					this.sendAccessToken(containerId)
						.then(() => {
							console.log(`Sent access token to ${containerId}`);
							resolve(socket);
						})
						.catch((error) => {
							console.error(`Failed to send access token for ${containerId}: `, error);
							reject(error);
						});
				} else {
					resolve(socket);
				}
			};

			socket.onmessage = (event) => {
				this.handleMessage(containerId, event);
			};

			socket.onclose = (event) => {
				console.log(`WebSocket for ${containerId} is onclose.`);
				this.handleClose(containerId);
			};

			socket.onerror = (error) => {
				console.error(`WebSocket error for ${containerId}: `, error);
				reject(error);
			};
		})
	}

	defaultMessageHandler(event, containerId) {
		const data = JSON.parse(event.data);
		console.log(`Default handler message from ${containerId}:`, data)
	}

	handleMessage(containerId, event) {
		const handler = this.messageHandlers[containerId];
		if (handler) {
			handler(event, containerId);
		} else {
			console.error(`No message from ${containerId}`);
		}
	}

	handleClose(containerId) {
		console.log(`WebSocket for ${containerId} is closing now.`);
		delete this.sockets[containerId];
		delete this.messageHandlers[containerId];
	}

	closeWebSocket(containerId) {
		const socket = this.sockets[containerId];
		if (socket) {
			socket.close();
			delete this.sockets[containerId];
			delete this.messageHandlers[containerId];
			console.log(`WebSocket for ${containerId} has been closed.`);
		}
	}

	sendWebSocketMessage(containerId, message) {
		const socket = this.sockets[containerId];
		if (socket && socket.readyState === WebSocket.OPEN) {
			socket.send(JSON.stringify(message));
			console.log(`Message sent to ${containerId}:`, message);
		} else {
			console.error(`WebSocket for ${containerId} is not open.`);
		}
	}

	isWebSocketOpened(containerId) {
		const socket = this.sockets[containerId];
		return socket && socket.readyState === WebSocket.OPEN;
	}

	getWebSocket(containerId) {
		return this.sockets[containerId];
	}

	async sendAccessToken(containerId) {
		console.log(`sendAccessToken to ${containerId}`);
		try {
			const accessToken = await initToken();
			//            await webSocketManager.openWebSocket(containerId, this.messageHandlers[containerId]);
			console.log('sendAccessToken: initToken() finish');
			const message = {
				type: 'authWebSocket',
				action: 'auth',
				token: accessToken.token
			};
			this.sendWebSocketMessage(containerId, message);
			console.log('send access token to backend.');
		} catch (error) {
			console.error('Failed to open or send through WebSocket: ', error);
		}
	}
}

// Singleton instance
const webSocketManager = new WebSocketManager();

////

const pongHandler = (event, containerId) => {
	console.log(`pongHandler called for containerID: ${containerId}`)
	let data;
	try {
		data = JSON.parse(event.data);
		if (data.type === 'authenticationFailed') {
			console.error(data.message);
			refreshAccessToken();
			// TODO: リフレッシュ後に再接続？
			// backendでjwtを再度生成してもらって再度pong-serverに投げる？
			// Playersクラスにステータスが要りそう（オンライン、オフライン、ゲーム中、ゲーム中ならばmatch_idも）
		}
		if (data.type === 'gameSession') {
			loadGameContent(data);
		}
		else if (data.type === 'friendMatchRequest') {
			handleFriendMatchRequestReceived(data);
		}
		else if (data.type === 'friendRequest') {
			handleFriendRequestReceived(data);
		}
		else if (data.type === 'ack') { // TODO: friendRequestAckに変更？
			handleFriendRequestAck(data);
		}
		else if (data.type === 'lounge') {
			handleLoungeMatchReceived(data);
		}
		else if (data.type === 'friendStatus') {
			handleFriendStatusReceived(data);
		}
		else if (data.type === 'tournament') {
			handleTournamentReceived(data);
		}
	} catch(error) {
		console.error(`Error parsing data from ${containerId}: `, error);
	}
}

const pongGameHandler = (event, containerId) => {
	let data;
	try {
		data = JSON.parse(event.data);
	} catch(error) {
		console.error(`Error parsing data from ${containerId}: `, error);
	}
	if (data.type === 'startGame') {
		console.log('game starting');
	}
	else if (data.type === 'error') {
		console.error(data.message);
	}
	else if (data.type === 'authenticationFailed') {
		console.error(data.error);
		refreshAccessToken();
	}
	console.log(`Message from ${containerId}: `, data);
}

const addNotice = (msg, iserror) => {
	if (iserror) {
		console.error(msg);
	} else {
		console.log(msg);
	}
}

const loadGameContent = async (data) => {
	const { game_name, jwt, match_id, username, player_name } = data;

	closeModal();

	console.log(`Loading ${game_name} content with JWT: `, jwt);
	console.log(`match_id: ${match_id}, Username: ${username}, Player_name: ${player_name}`);

	const gameMatchId = match_id;
	const containerId = `${game_name}/${gameMatchId}`;
	console.log(`URL = ${containerId}`);

	try {
		const socket = await webSocketManager.openWebSocket(containerId, pongGameHandler);
		console.log(`WebSocket for ${containerId} is open!!!`);
		if (socket.readyState === WebSocket.OPEN) {
			webSocketManager.sendWebSocketMessage(containerId, {
				action: 'authenticate',
				jwt: jwt,
				player_name: player_name,
			});
			console.log('Token sent to pong-server');
			// TODO: ゲーム画面に変遷してゲーム続行
			if (game_name === 'pong') {
				window.history.pushState({}, null, `/game/pong/play:${gameMatchId}`);
			} else {
				// game_name === 'pong4'
				window.history.pushState({}, null, `/game/pong4/play:${gameMatchId}`);
			}
			await router(true);
		} else {
			console.error('WebSocket is not in OPEN state.');
		}
	} catch (error) {
		console.error('Error loadGameContent fails initializing WebSocket.', error);
	}
}

const handleFriendRequestAck = (data) => {
	const currentPage = (PageBase.isInstance(PageBase.instance, 'Friends') || PageBase.isInstance(PageBase.instance, 'Dashboard'))
		? PageBase.instance : null;
	if (data.action === 'error') {
		if (data.error === 'alreadyFriends') {
			addNotice(labels.friendRequest['alreadyFriends'].replace('$name', data.username), false);
		} else if (data.error === 'usernameNotExists') {
			addNotice(labels.friendRequest['usernameNotExists'].replace('$name', data.username), true);
		} else if (data.error === 'sendFriendReqSelf') {
			addNotice(labels.friendRequest['sendFriendReqSelf'].replace('$name', data.username), true);
		} else if (data.error === 'invalidDeclineFriendReq') {
			addNotice(labels.friendRequest['invalidDeclineFriendReq'].replace('$name', data.username), true);
		} else {
			console.error(`Error: ${data.message}`);
		}
	} else if (data.action === 'sentRequestSuccess') {
		console.log('Friend request by username is sent to ', data.to_username);
		addNotice(labels.friendRequest['sentRequestSuccess'].replace('$name', data.to_username), false);
		if (currentPage) {
			updateFriendRequestList(currentPage).then(() => {});
		}
	} else if (data.action === 'acceptRequestSuccess') {
		console.log('Accept friend request is successfully done');
		addNotice(labels.friendRequest['acceptRequestSuccess'].replace('$name', data.from_username), false);
		if (currentPage) {
			updateFriendRequestList(currentPage).then(() => {});
			updateFriendsList(currentPage).then(() => {});
		}
	} else if (data.action === 'declineRequestSuccess') {
		console.log('Decline friend request is successfully done');
		addNotice(labels.friendRequest['declineRequestSuccess'].replace('$name', data.username), false);
		if (currentPage) {
			updateFriendRequestList(currentPage).then(() => {});
		}
	} else if (data.action === 'removeSuccess') {
		console.log('Remove Successfully done');
		addNotice(labels.friendRequest['removeSuccess'].replace('$name', data.username), false);
		if (currentPage) {
			updateFriendsList(currentPage).then(() => {});
		}
	}
}

const handleFriendRequestReceived = (data) => {
	const currentPage = (PageBase.isInstance(PageBase.instance, 'Friends') || PageBase.isInstance(PageBase.instance, 'Dashboard'))
		? PageBase.instance : null;

	console.log('handleFriendRepuestReceived: received');
	if (data.action === 'received') {
		addNotice(labels.friendRequest['received'].replace('$name', data.from_username), false);
		if (currentPage) {
			updateFriendRequestList(currentPage).then(() => {});
		}
	} else if (data.action === 'accepted') {
		addNotice(labels.friendRequest['accepted'].replace('$name', data.from_username), false);
		if (currentPage) {
			updateFriendsList(currentPage).then(() => {});
		}
	} else if (data.action === 'removed') {
		//rmられは通知されない
		console.log(labels.friendRequest['removed'].replace('$name', data.from_username));
		if (currentPage) {
			updateFriendsList(currentPage).then(() => {});
		}
	}
}

const handleFriendMatchRequestReceived = (data) => {
	if (data.action === 'requested') {
		// TODO: すでに別のプレイヤーからのリクエストが来ている場合の処理
		showModalReceiveMatchRequest(data);
	} else if (data.action === 'accepted') {
		// 対戦相手がアクセプトボタンを押した
	} else if (data.action === 'cancelled') {
		// 対戦を申し込んだ主がキャンセルボタンを押した
		closeModal();
		addNotice(labels.matchRequest['cancelled'], true);
	} else if (data.action === 'rejected') {
		// 申し込んだ相手がリジェクトボタンを押した
		closeModal();
		addNotice(labels.matchRequest['rejected'], true);
	} else if (data.action === 'error') {
		closeModal();
		if (data.error === 'playerNotWaitingStatus') {
			addNotice(labels.matchRequest['playerNotWaitingStatus'], true);
		} else if (data.error === 'userOffline') {
			addNotice(labels.matchRequest['userOffline'], true);
		} else {
			console.error(`Error: ${data.message}`);
		}
	}
}

const handleLoungeMatchReceived = (data) => {
	if (data.action === 'update') {
		updateModalAvailablePlayers(data.availablePlayers);
	} else if (data.action === 'error') {
		closeModal();
		alert(`Error: ${data.message}`);
	}
}

const handleFriendStatusReceived = (data) => {
	const currentPage = (PageBase.isInstance(PageBase.instance, 'Friends') || PageBase.isInstance(PageBase.instance, 'Dashboard'))
		? PageBase.instance : null;

	if (data.action === 'change') {
		const online_status_msg = data.online === 'online' ? 'ログイン' : 'ログアウト';
		console.log(`friendStatus change: ${data.username} to ${online_status_msg}`);
		addNotice(`${data.username}が${online_status_msg}しました`, false);
		if (currentPage) {
			updateFriendsList(currentPage).then(() => {});
		}
	}
}

const handleTournamentReceived = (data) => {
	if (data.action === 'created') {
		const startUTC = new Date(data.start);
		const startLocal = startUTC.toLocaleString();
		console.log(`UTC Time: ${startUTC.toISOString()}`);
		console.log(`Local Time: ${startLocal}`);
		const message = `${data.name} - ${startLocal} が作成されました`;
		console.log(`${message}`);
		addNotice(message, false);
	} else if (data.action === 'alreadyExists') {
		const message = `同名のトーナメントがすでに存在しています`;
		addNotice(message, true);
	}
}

////

const main = () => {
	const username = process.env.DJANGO_PLAYER1_USER;
	const password = process.env.DJANGO_PLAYER1_PASSWORD;
	process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
	fetch('https://'+HOST+'/api/players/login/', {
		'method': 'POST',
		'headers': {
			'Content-Type': 'application/json'
		},
		'body': JSON.stringify({
			'username': username,
			'password': password,
		})
	}).then(response => {
		console.log('response:', response.status);
		if (!response.ok) {
			throw new Error('loginError');
		}
		return response.json();
	}).then(data => {
		console.log(data);
		sessionStorage.setItem('accessToken', data.access_token);
		sessionStorage.setItem('refreshToken', data.refresh_token);
		webSocketManager.openWebSocket('lounge', pongHandler)
			.then(() => {})
			.catch((error) => {
				console.error('error opening websocket');
			});
	})
}

main()
