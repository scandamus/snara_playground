import asyncio
import requests
import json
import os
import websocket
import websockets
import threading
import ssl
from getpass import getpass
from dotenv import load_dotenv

HOST = 'https://localhost'
WS_URI = 'wss://localhost/ws/'


class Storage:
    instance = None

    def __new__(cls):
        if cls.instance is None:
            cls.instance = super().__new__(cls)
        return cls.instance

storage = Storage()


def login():
    username = os.environ.get('DJANGO_PLAYER1_USER')
    if not username:
        username = input('username: ')
    password = os.environ.get('DJANGO_PLAYER1_PASSWORD')
    if not password:
        password = getpass('password: ')
    data = {
        'username': username,
        'password': password
    }
    res = requests.post(HOST+'/api/players/login/', json=(data), verify=False)
    token = json.loads(res.text)
    print(token)
    storage.access_token = token['access_token']
    storage.refresh_token = token['refresh_token']
    print('successfully logged in as', username)


def get_friends():
    access_token = storage.access_token
    res = requests.get(HOST+'/api/friends/friends/', headers={'Authorization': f'Bearer {access_token}'}, verify=False)
    return json.loads(res.text)


class WebSocketManager:
    def __init__(self):
        self.sockets = {}
        self.messageHandlers = {}

    def openWebsocket_(self, containerId):
        def on_message(ws, message):
            print("on_message:", message)

        def on_error(ws, error):
            print("error:", error)

        def on_close(ws, *args):
            print(*args, "### closed ###")

        def on_open(ws):
            print(ws, 'open')
            access_token = storage.access_token
            msg = json.dumps({
                'type': 'authWebSocket',
                'action': 'auth',
                'token': access_token,
            })
            websocket.send(msg)

        uri = WS_URI+'{containerId}/'
        ws = websocket.WebSocketApp(uri, on_message=on_message, on_error=on_error, on_close=on_close, on_open=on_open)
        ws.run_forever(sslopt={"cert_reqs": ssl.CERT_NONE})


    async def openWebsocket(self, containerId):
        uri = WS_URI+containerId
        access_token = storage.access_token
        async with websockets.connect(uri, ssl=False) as ws:
            print('connect', ws)
            msg = json.dumps({
                'type': 'authWebSocket',
                'action': 'auth',
                'token': access_token,
            })
            await ws.send(msg)

            print('send')

            res = await ws.recv()
            print(res)

webSocketManager = WebSocketManager()


def main():
    load_dotenv()
    requests.packages.urllib3.disable_warnings()
    login()
    friends = get_friends()
    print('friends:', friends) #, *['%-32s %s' % (user['username'], ['offline', 'online'][user['online']]) for user in friends], sep='\n')
    ws = webSocketManager.openWebsocket_('lounge')


if __name__ == '__main__':
    main()
