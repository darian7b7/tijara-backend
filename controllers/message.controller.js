import Message from "../models/Message.js";
import Conversation from "../models/conversation.model.js";

export const sendMessage = async (req, res) => {
  try {
    const { receiverId, content, listingId } = req.body;
    const senderId = req.user._id;

    // Find or create conversation
    let conversation = await Conversation.findOne({
      listing: listingId,
      participants: { $all: [senderId, receiverId] },
    });

    if (!conversation) {
      conversation = await Conversation.create({
        listing: listingId,
        participants: [senderId, receiverId],
      });
    }

    const message = await Message.create({
      conversation: conversation._id,
      sender: senderId,
      receiver: receiverId,
      content,
    });

    // Populate sender details
    await message.populate("sender", "username profilePicture");

    // Update conversation's last message
    conversation.lastMessage = message._id;
    conversation.updatedAt = new Date();
    await conversation.save();

    res.status(201).json(message);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getConversations = async (req, res) => {
  try {
    const conversations = await Conversation.find({
      participants: req.user._id,
    })
      .populate("listing", "title images")
      .populate("participants", "username profilePicture")
      .populate("lastMessage")
      .sort("-updatedAt");

    res.json(conversations);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const messages = await Message.find({ conversation: conversationId })
      .populate("sender", "username profilePicture")
      .sort("createdAt");

    res.json(messages);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
