import mongoose from 'mongoose';

// Define allowed categories and conditions for maintainability
const allowedCategories = ['cars', 'motorcycles', 'trucks', 'boats', 'rvs', 'residential', 'commercial', 'land', 'industrial'];
const allowedConditions = ['new', 'like-new', 'excellent', 'good', 'fair', 'needs-work'];

const listingSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: [100, 'Title must not exceed 100 characters']
  },
  description: {
    type: String,
    required: true,
    maxlength: [1000, 'Description must not exceed 1000 characters']
  },
  price: {
    type: Number,
    required: true,
    min: [0, 'Price must be a positive number']
  },
  category: {
    type: String,
    required: true,
    enum: {
      values: allowedCategories,
      message: 'Invalid category selected'
    }
  },
  subcategory: {
    type: String,
    required: true
  },
  condition: {
    type: String,
    required: true,
    enum: {
      values: allowedConditions,
      message: 'Invalid condition selected'
    }
  },
  images: {
    type: [String],
    required: true,
    validate: {
      validator: function (images) {
        return images.length > 0;
      },
      message: 'Please add at least one image'
    }
  },
  location: {
    type: String,
    required: true
  },
  transactionType: {
    type: String,
    required: true
  },
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  details: {
    make: { type: String },
    model: { type: String },
    year: { type: Number },
    mileage: { type: Number },
    fuelType: String,
    transmission: String,
    engineSize: String,
    power: Number,
    doors: Number,
    color: String,

    // Real Estate-specific fields
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
    orientation: String
  },
  status: {
    type: String,
    enum: ['available', 'sold', 'pending'],
    default: 'available'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  views: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index for better search performance
listingSchema.index({ title: 'text', description: 'text', location: 'text', category: 1 });

const Listing = mongoose.model('Listing', listingSchema);
export default Listing;
