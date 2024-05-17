import json

from channels.generic.websocket import AsyncWebsocketConsumer
from datetime import datetime as dt


class PongConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_name = self.scope["url_route"]["kwargs"]["room_name"]
        self.room_group_name = f"pong_{self.room_name}"

        # Join room group
        await (self.channel_layer.group_add)(self.room_group_name, self.channel_name)

        await self.accept()

    async def disconnect(self, close_code):
        # Leave room group
        await (self.channel_layer.group_discard)(self.room_group_name, self.channel_name)

    # Receive message from WebSocket
    async def receive(self, text_data):
        text_data_json = json.loads(text_data)
        message = text_data_json["message"]
        ball = text_data_json.get("ball")
        paddle1 = text_data_json.get("paddle1")
        paddle2 = text_data_json.get("paddle2")

        # Send message to room group
        await (self.channel_layer.group_send)(self.room_group_name, {
            "type": "pong.message",
            "timestamp": dt.utcnow().isoformat(),
            "message": message,
            "ball": ball,
            "paddle1": paddle1,
            "paddle2": paddle2,
        })

    # Receive message from room group
    async def pong_message(self, event):
        timestamp = event["timestamp"]
        message = event["message"]
        ball = event["ball"]
        paddle1 = event["paddle1"]
        paddle2 = event["paddle2"]

        # Send message to WebSocket
        await self.send(text_data=json.dumps({
            "message": message + f'\n{timestamp}\n\np2={paddle2}\n\nball={ball}\n\np1={paddle1}',
        }))
