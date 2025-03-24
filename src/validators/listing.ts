import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface ValidationError {
  field: string;
  message: string;
}

export async function validateListing(data: any): Promise<ValidationError[]> {
  const errors: ValidationError[] = [];

  // Validate basic fields
  if (!data.title?.trim()) {
    errors.push({ field: 'title', message: 'Title is required' });
  }

  if (!data.description?.trim()) {
    errors.push({ field: 'description', message: 'Description is required' });
  }

  if (!data.price || isNaN(Number(data.price)) || Number(data.price) <= 0) {
    errors.push({ field: 'price', message: 'Valid price is required' });
  }

  if (!data.location?.trim()) {
    errors.push({ field: 'location', message: 'Location is required' });
  }

  if (!data.categoryId) {
    errors.push({ field: 'categoryId', message: 'Category is required' });
  }

  // Validate required attributes based on category
  if (data.categoryId) {
    const requiredAttributes = await prisma.attributeDefinition.findMany({
      where: {
        categoryId: data.categoryId,
        required: true,
      },
    });

    const providedAttributes = new Set(
      data.attributes?.map((attr: any) => attr.definitionId) || []
    );

    for (const attr of requiredAttributes) {
      if (!providedAttributes.has(attr.id)) {
        errors.push({
          field: `attribute_${attr.name}`,
          message: `${attr.label} is required`,
        });
      }
    }
  }

  // Validate images
  if (!data.images || data.images.length === 0) {
    errors.push({
      field: 'images',
      message: 'At least one image is required',
    });
  }

  return errors;
}
