import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, "Please add a username"],
    unique: true,
    trim: true
  },
  email: {
    type: String,
    required: [true, "Please add an email"],
    unique: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      "Please add a valid email"
    ]
  },
  password: {
    type: String,
    required: [true, "Please add a password"],
    minlength: 6,
    select: false
  },
  profilePicture: {
    type: String,
    default: "https://via.placeholder.com/150"
  },
  bio: {
    type: String,
    maxlength: 500
  },
  location: {
    type: String,
    default: "" // Users can set their city/country
  },
  showLocation: {
    type: Boolean,
    default: true // Users can choose whether to display their location
  },
  preferences: {
    type: Object,
    default: {
      language: "en"
    }
  },
  autoLogoutTime: {
    type: Number,
    default: 0 // 0 = Never, 1 = 1 Hour, 12 = 12 Hours, 24 = 24 Hours
  },
  lastLogin: {
    type: Date,
    default: null // Tracks the last login date
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Hash password before saving to DB (only if modified)
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare entered password with hashed password
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Update last login when user logs in
userSchema.methods.updateLastLogin = async function () {
  this.lastLogin = new Date();
  await this.save();
};

const User = mongoose.model("User", userSchema);

export default User;
