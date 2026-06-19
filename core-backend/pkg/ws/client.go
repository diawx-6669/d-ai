package ws

import (
	"encoding/json"

	"github.com/gorilla/websocket"
)

type Message struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
}

type Client struct {
	conn *websocket.Conn
}

func NewClient(conn *websocket.Conn) *Client {
	return &Client{conn: conn}
}

func (c *Client) Listen() {
	defer c.conn.Close()
	for {
		_, raw, err := c.conn.ReadMessage()
		if err != nil {
			break
		}
		var msg Message
		if err := json.Unmarshal(raw, &msg); err != nil {
			continue
		}
		// Echo back — replace with real dispatch logic
		_ = c.conn.WriteJSON(Message{Type: "ack", Payload: msg.Type})
	}
}
