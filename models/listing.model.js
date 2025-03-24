import mongoose from "mongoose";

// Define allowed categories and conditions for maintainability
const allowedCategories = [
  "vehicles",
  "real_estate",
];

const allowedConditions = [
  "new",
  "like-new",
  "excellent",
  "good",
  "fair",
  "needs-work",
];

const listingSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: [100, "Title must not exceed 100 characters"],
    },
    description: {
      type: String,
      required: true,
      maxlength: [1000, "Description must not exceed 1000 characters"],
    },
    price: {
      type: Number,
      required: true,
      min: [0, "Price must be a positive number"],
    },
    category: {
      type: String,
      required: true,
      enum: {
        values: allowedCategories,
        message: "Invalid category selected",
      },
    },
    subcategory: {
      type: String,
      required: false,
    },
    condition: {
      type: String,
      required: false,
      enum: {
        values: allowedConditions,
        message: "Invalid condition selected",
      },
    },
    images: {
      type: [String],
      required: true,
      validate: {
        validator: function (images) {
          return images.length > 0;
        },
        message: "Please add at least one image",
      },
    },
    location: {
      type: String,
      required: true,
    },
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    savedBy: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    }],
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
      vehicles: {
        make: String,
        model: String,
        fuelType: String,
        transmission: String,
        paintCondition: String,
        bodyType: String,
        mileage: Number,
        engineSize: Number,
        horsepower: Number,
        condition: String,
        doors: Number,
        seats: Number,
        driveType: String,
        color: String,
        interiorColor: String,
        vin: String,
        licensePlate: String,
        previousOwners: String,
        maintenanceHistory: String
      },
      realEstate: {
        propertyType: String,
        size: Number,
        bedrooms: Number,
        bathrooms: Number,
        yearBuilt: Number,
        parking: Number,
        amenities: [String],
        furnished: Boolean,
        floor: Number,
        totalFloors: Number,
        orientation: String,
      }
    },
    features: {
      type: [String],
      default: []
    },
    status: {
      type: String,
      enum: ["available", "sold", "pending"],
      default: "available",
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    views: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Index for better search performance
listingSchema.index({
  title: "text",
  description: "text",
  location: "text",
  category: 1,
});

const Listing = mongoose.model("Listing", listingSchema);
export default Listing;
