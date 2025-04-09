export type Product = {
  displayTitle: string;
  embeddingText: string;
  url: string;
  imageUrl: string;
  productType: string;
  discount: string;
  price: string;
  variants: string;
  createDate: string;
};

export type ExtractPriceFromDB = {
  amount: number;
  currency: string;
  productName: string;
};
