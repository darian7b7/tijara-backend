import { Request } from "express";

export interface AuthRequest extends Request {
  user: {
    id: string;
    email: string;
    username: string;
    role: string;
  };
  files?: Express.Multer.File[];
  file?: Express.Multer.File;
  processedImages?: ProcessedImage[];
}

export interface ProcessedImage {
  url: string;
  order: number;
}

export interface ListingCreateInput {
  title: string;
  description: string;
  price: number | string;
  category: string;
  location: string;
  condition?: string;
  attributes?: any[];
  features?: any[];
  images?: ProcessedImage[];
}

export interface ListingUpdateInput {
  title?: string;
  description?: string;
  price?: number | string;
  category?: string;
  location?: string;
  condition?: string;
  attributes?: any[];
  features?: any[];
  images?: ProcessedImage[];
}

export enum ListingCategory {
  VEHICLES = "VEHICLES",
  REAL_ESTATE = "REAL_ESTATE",
}

export enum VehicleType {
  CARS = "CARS",
  MOTORCYCLES = "MOTORCYCLES",
  BOATS = "BOATS",
  OTHER = "OTHER",
}

export enum PropertyType {
  HOUSE = "HOUSE",
  APARTMENT = "APARTMENT",
  LAND = "LAND",
  OTHER = "OTHER",
}

export enum ListingStatus {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
  PENDING = "PENDING",
  SOLD = "SOLD",
}

export interface Location {
  address: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
}

export interface ListingBase {
  id: string;
  title: string;
  description: string;
  price: number;
  location: string | Location;
  category: string;
  images: string[];
  createdAt: Date;
  updatedAt: Date;
  userId: string;
  status: string;
  attributes?: Record<string, string>;
  features?: string[];
}

export interface ListingWithRelations {
  id: string;
  title: string;
  description: string;
  price: number;
  location: string;
  category: string;
  images: string[];
  createdAt: Date;
  updatedAt: Date;
  status: string;
  seller?: {
    id: string;
    username: string;
    profilePicture: string | null;
  };
  savedBy: {
    id: string;
    userId: string;
  }[];
  attributes?: any;
  features?: any;
}

export interface APIResponse<T> {
  success: boolean;
  data: T | null;
  error?: string;
  status: number;
}

export interface PaginatedData<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface PaginatedResponse<T> extends APIResponse<PaginatedData<T>> {}
