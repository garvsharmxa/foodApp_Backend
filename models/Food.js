import mongoose from 'mongoose';

const FoodSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        minlength: 2
    },
    cooking_time: {
        type: Number,
        required: true,
        min: 1
    },
    price: {
        type: Number,
        required: true,
        min: 1
    },
    instock: {
        type: Boolean,
        default: true
    },
    veg: {
        type: Boolean,
        default: false
    },
    beverage: {
        type: Boolean,
        default: false
    },
    cuisine: {
        type: String,
        default: 'International'
    },
    order_num: {
        type: Number,
        default: 0
    },
    image: {
        type: String,
        required: true
    },
    menu_category: {
        type: Number,
        required: true
    },
    shopid: {
        type: Number,
        required: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date
    }
});

FoodSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

const Food = mongoose.model('Food', FoodSchema);

export default Food;
