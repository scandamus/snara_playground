import json

from channels.generic.websocket import AsyncWebsocketConsumer
from datetime import datetime as dt


class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        print(self.scope)
        self.room_name = self.scope["url_route"]["kwargs"]["room_name"]
        self.room_group_name = f"chat_{self.room_name}"

        # Join room group
        await self.channel_layer.group_add(self.room_group_name, self.channel_name)

        await self.accept()

    async def disconnect(self, close_code):
        # Leave room group
        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

    # Receive message from WebSocket
    async def receive(self, text_data):
        print("data=", text_data)
        text_data_json = json.loads(text_data)
        message = text_data_json["message"]

        # Send message to room group
        await self.channel_layer.group_send(self.room_group_name, {
            "type": "chat.message",
            "timestamp": dt.utcnow().isoformat(),
            "coordinate": (0, 42),
            "message": message,
        })

    # Receive message from room group
    async def chat_message(self, event):
        print("event=", event)
        message = event["message"]
        timestamp = event["timestamp"]

        # Send message to WebSocket
        await self.send(text_data=json.dumps({
            "message": timestamp + " " + message,
        }))
