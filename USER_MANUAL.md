# DeliveryEase - User Manual

## PREREQUISITES

### Technical Knowledge
- **Basic Knowledge**: JavaScript, React, TypeScript, and Supabase
- **Understanding**: Modern web development concepts and REST APIs
- **Familiarity**: Database concepts and SQL queries

### Development Tools
- **Code Editor**: Visual Studio Code (recommended) or any modern code editor
- **Command Line/Terminal**: Access to terminal or command prompt
- **Git**: For version control and collaboration

### System Requirements
- **Operating System**: Windows 10/11, macOS 10.15+, or Linux (Ubuntu 18.04+)
- **Node.js**: Version 18.0.0 or higher
- **npm**: Version 8.0.0 or higher
- **Modern Web Browser**: Chrome 90+, Firefox 88+, Safari 14+, or Edge 90+
- **Internet Connection**: Required for Supabase database operations and external services

## INSTALLATION

### 1. Installing Dependencies

#### Frontend (React + TypeScript)

##### Step 1: Install Node.js and npm
1. **Download Node.js**
   - Visit [nodejs.org](https://nodejs.org/)
   - Download the LTS (Long Term Support) version
   - Run the installer and follow the setup wizard

2. **Verify Installation**
   ```bash
   node --version
   npm --version
   ```
   - Ensure Node.js version is 18.0.0 or higher
   - Ensure npm version is 8.0.0 or higher

##### Step 2: Clone the Repository
1. **Open Terminal/Command Prompt**
   ```bash
   # Navigate to your desired directory
   cd C:\Users\YourUsername\Desktop
   
   # Clone the repository
   git clone [repository-url]
   
   # Navigate into the project directory
   cd DeliveryEase/CAPSTONE
   ```

2. **Verify Project Structure**
   ```bash
   # List files to ensure correct structure
   dir
   # You should see: src/, public/, package.json, etc.
   ```

##### Step 3: Install Dependencies
1. **Install Node.js Packages**
   ```bash
   npm install
   ```
   - This will install all dependencies listed in package.json
   - Wait for installation to complete (may take several minutes)
   - Look for "added X packages" message

2. **Verify Installation**
   ```bash
   # Check if node_modules folder was created
   dir
   
   # Verify key dependencies are installed
   npm list react
   npm list @supabase/supabase-js
   ```

##### Step 4: Environment Configuration
1. **Create Environment File**
   ```bash
   # Create .env file in root directory
   echo. > .env
   ```

2. **Add Environment Variables**
   Open `.env` file and add:
   ```env
   VITE_SUPABASE_URL=your_supabase_project_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

3. **Verify Environment File**
   ```bash
   # Check if .env file exists
   dir .env
   ```

### 2. Setting Up the Database (Supabase)

#### Installing Supabase
1. **Visit the official Supabase website**
   - Go to [supabase.com](https://supabase.com)
   - Click "Start your project" or "Sign Up"

2. **Follow the account creation process**
   - Choose "Sign up with GitHub" (recommended) or email
   - Complete account verification process
   - Verify your email address

#### Setting Up Supabase Database
1. **Open Supabase dashboard and log in to your account**
2. **Create a new project**
3. **Set up your database configuration**

#### Creating the Database
1. **Click "New Project" button**
2. **Configure your project settings**:
   - **Name**: Enter "DeliveryEase" or your preferred name
   - **Database Password**: Create a strong password (save this!)
   - **Region**: Choose closest to your location
   - **Pricing Plan**: Select "Free tier" for development

3. **Wait for project setup to complete** (takes 2-5 minutes)

#### Importing the Database Schema
1. **Access the SQL Editor**:
   - In Supabase dashboard, go to "SQL Editor"
   - Click "New query"

2. **Import the database schema**:
   - **Option A: Automatic Setup**
     - The system will automatically create tables on first use
     - No manual import required
   
   - **Option B: Manual Import**
     - Copy and paste SQL scripts if provided
     - Execute the scripts in the SQL Editor

3. **Verify the database setup**:
   - Go to "Table Editor" in Supabase
   - Ensure these tables are created:
     - `users` (created automatically by Supabase Auth)
     - `profiles`
     - `products`
     - `categories`
     - `orders`
     - `order_items`
     - `order_batches`
     - `addresses`
     - `drivers`
     - `notifications`

#### Setting Up Storage Buckets
1. **Navigate to Storage section**:
   - Go to "Storage" in Supabase dashboard
   - Click "Create a new bucket"

2. **Create required storage buckets**:
   - **Product Images Bucket**
     - Name: `product-images`
     - Public: Yes
   
   - **Category Images Bucket**
     - Name: `category-images`
     - Public: Yes
   
   - **Profile Images Bucket**
     - Name: `profile-images`
     - Public: Yes

3. **Configure storage policies**:
   - Go to "Storage" → "Policies"
   - Ensure public read access for images
   - Set appropriate upload policies for each bucket

#### Getting Database Credentials
1. **Access Project Settings**:
   - Click on your project name
   - Go to "Settings" → "API"

2. **Copy the required credentials**:
   - **Project URL**: Copy the "Project URL" (starts with https://)
   - **Anon Key**: Copy the "anon public" key
   - **Service Role Key**: Copy the "service_role" key (keep secret)

3. **Update your environment file**:
   ```env
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=your_anon_key_here
   ```

### 3. Running the Full Stack Application

#### Running the Frontend (React + TypeScript)
1. **Ensure you are in the project directory**
   ```bash
   cd DeliveryEase/CAPSTONE
   ```

2. **Start the React application**
   ```bash
   npm run dev
   ```

3. **Verify the application is running**
   - Look for "Local: http://localhost:3008/" in terminal
   - Open your browser and navigate to http://localhost:3008

#### Running the Backend (Supabase)
1. **Ensure Supabase project is active**
   - Verify your Supabase project is running
   - Check that environment variables are set correctly

2. **Verify database connection**
   - Check Supabase dashboard for active status
   - Ensure all required tables are created

#### Verify the Setup
1. **Frontend Verification**
   - Open your browser and go to http://localhost:3008
   - Verify the DeliveryEase landing page loads correctly
   - Check that all navigation links work

2. **Backend Verification**
   - Ensure your React app can communicate with Supabase
   - Verify authentication system is working
   - Test database operations (create, read, update, delete)

3. **Database Verification**
   - Check Supabase dashboard for active connections
   - Verify real-time subscriptions are working
   - Test storage bucket access

#### Credentials
- **Admin**
  - User Id: admin@deliveryease.com
  - Password: admin123

- **Customer**
  - User Id: customer@example.com
  - Password: customer123

- **Driver**
  - User Id: driver@deliveryease.com
  - Password: driver123

#### Development Features
- **Hot Reload**: Enabled automatically for instant updates
- **Error Overlay**: Shows errors in browser for debugging
- **Source Maps**: Available for development debugging
- **Real-time Updates**: Database changes reflect immediately
- **Environment Variables**: Loaded from .env file

#### Production Build
1. **Build the application**
   ```bash
   npm run build
   ```

2. **Preview production build**
   ```bash
   npm run preview
   ```

3. **Deploy to production**
   ```bash
   # For Vercel
   vercel --prod

   # For Netlify
   netlify deploy --prod

   # For traditional hosting
   # Upload dist/ folder contents to web server
   ```

#### Additional Commands

##### Code Quality
```bash
# Run ESLint for code quality
npm run lint

# Fix auto-fixable issues
npm run lint -- --fix

# TypeScript type checking
npm run type-check
```

##### Development Utilities
```bash
# Clear cache and reinstall
npm run clean
rm -rf node_modules package-lock.json
npm install

# Check for outdated packages
npm outdated

# Update packages
npm update
```

##### Troubleshooting Commands
```bash
# Check Node.js version compatibility
node --version

# Verify npm cache
npm cache verify

# Clear npm cache
npm cache clean --force

# Check for global packages conflicts
npm list -g --depth=0
```

#### Environment-Specific Configuration

##### Development Environment
```env
# .env.development
VITE_SUPABASE_URL=https://your-dev-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_dev_anon_key
VITE_APP_ENV=development
VITE_DEBUG=true
```

##### Production Environment
```env
# .env.production
VITE_SUPABASE_URL=https://your-prod-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_prod_anon_key
VITE_APP_ENV=production
VITE_DEBUG=false
```

##### Local Development with Supabase CLI
```bash
# Install Supabase CLI
npm install -g supabase

# Start local Supabase
supabase start

# Get local credentials
supabase status

# Update .env with local URLs
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=your_local_anon_key
```

## MODULES

### The Admin Module

#### The Admin Login
- **Access**: Navigate to `/admin` or `/login`
- **Authentication**: Email and password-based login
- **Security**: Protected routes with session management
- **Features**:
  - Secure authentication via Supabase Auth
  - Session persistence
  - Automatic redirect to admin dashboard after login

#### The Admin Dashboard
- **Access**: `/admin` (main dashboard)
- **Features**:
  - **Sales Analytics**: Revenue charts and statistics
  - **Order Status Overview**: Real-time order status tracking
  - **Category Performance**: Product category analytics
  - **Quick Actions**: Fast access to common admin tasks
  - **Real-time Updates**: Live data from database

#### The Admin Products Page
- **Access**: `/admin/products`
- **Features**:
  - **Product Management**: Add, edit, delete products
  - **Image Upload**: Drag-and-drop product image management
  - **Category Assignment**: Organize products by categories
  - **Inventory Tracking**: Stock level monitoring
  - **Weight Management**: Product weight for delivery calculations
  - **Bulk Operations**: Mass product updates

#### The Admin Categories Page
- **Access**: `/admin/categories`
- **Features**:
  - **Category Management**: Create, edit, delete product categories
  - **Image Management**: Category-specific image uploads
  - **Hierarchical Organization**: Structured category system
  - **Product Association**: Link products to categories

#### The Admin Verify Orders Page
- **Access**: `/admin/verify-orders`
- **Features**:
  - **Order Verification**: Review and approve pending orders
  - **Payment Confirmation**: Verify payment proofs
  - **Order Details**: Complete order information display
  - **Status Updates**: Change order status (pending, approved, rejected)
  - **Batch Assignment**: Assign orders to delivery batches

#### The Admin Batch Orders Page
- **Access**: `/admin/batch-orders`
- **Features**:
  - **Batch Management**: Create and manage delivery batches
  - **Geographic Grouping**: Automatic barangay-based batching
  - **Weight Optimization**: Smart batch weight distribution
  - **Driver Assignment**: Assign batches to available drivers
  - **Route Optimization**: Geographic batch consolidation
  - **Real-time Updates**: Live batch status monitoring

#### The Admin Drivers Page
- **Access**: `/admin/drivers`
- **Features**:
  - **Driver Management**: Add, edit, remove drivers
  - **Profile Management**: Driver information and contact details
  - **Assignment Tracking**: Monitor driver-batch assignments
  - **Performance Metrics**: Delivery success rates and statistics

### The Customer Module

#### The Customer Login/Registration
- **Access**: `/login` or `/register`
- **Features**:
  - **User Registration**: Email-based account creation
  - **Secure Authentication**: Password-protected login
  - **Profile Management**: Personal information and preferences
  - **Address Management**: Multiple delivery addresses

#### The Customer Home Page
- **Access**: `/customer` (main customer dashboard)
- **Features**:
  - **Product Browsing**: Featured products and categories
  - **Search Functionality**: Find products quickly
  - **Recent Orders**: Order history and status
  - **Quick Actions**: Fast access to cart and orders

#### The Customer Products Page
- **Access**: `/customer/products`
- **Features**:
  - **Product Catalog**: Browse all available products
  - **Category Filtering**: Filter by product categories
  - **Search and Sort**: Find products by name or price
  - **Product Details**: View product information and images
  - **Add to Cart**: One-click cart addition

#### The Customer Product Details Page
- **Access**: `/customer/products/:id`
- **Features**:
  - **Detailed Information**: Complete product specifications
  - **Image Gallery**: Multiple product images
  - **Pricing**: Current prices and availability
  - **Add to Cart**: Quantity selection and cart addition
  - **Related Products**: Similar product suggestions

#### The Customer Cart Page
- **Access**: `/customer/cart`
- **Features**:
  - **Cart Management**: View and modify cart items
  - **Quantity Adjustment**: Increase/decrease item quantities
  - **Price Calculation**: Real-time total calculation
  - **Item Removal**: Remove unwanted items
  - **Checkout Process**: Proceed to order completion

#### The Customer Checkout Page
- **Access**: `/customer/checkout`
- **Features**:
  - **Address Selection**: Choose delivery address
  - **Payment Method**: Select payment options
  - **Order Summary**: Review cart items and totals
  - **Delivery Options**: Choose delivery preferences
  - **Order Confirmation**: Final order submission

#### The Customer Orders Page
- **Access**: `/customer/orders`
- **Features**:
  - **Order History**: Complete order tracking
  - **Status Updates**: Real-time order status
  - **Order Details**: View individual order information
  - **Tracking**: Monitor delivery progress
  - **Reorder**: Quick reorder functionality

#### The Customer Profile Page
- **Access**: `/customer/profile`
- **Features**:
  - **Personal Information**: Edit profile details
  - **Address Management**: Add, edit, delete addresses
  - **Order Preferences**: Set delivery preferences
  - **Account Settings**: Password and security settings

#### The Customer Address Management
- **Access**: `/customer/add-address` and `/customer/edit-address/:id`
- **Features**:
  - **Address Creation**: Add new delivery addresses
  - **Address Editing**: Modify existing addresses
  - **Geolocation**: Map-based address selection
  - **Barangay Selection**: Choose delivery area
  - **Address Validation**: Ensure accurate delivery information

#### The Customer Notifications Page
- **Access**: `/customer/notifications`
- **Features**:
  - **Order Updates**: Real-time order status notifications
  - **Delivery Alerts**: Delivery progress updates
  - **Promotional Messages**: Special offers and announcements
  - **System Notifications**: Important account updates

### The Driver Module

#### The Driver Login
- **Access**: `/driver` (redirects to login if not authenticated)
- **Features**:
  - **Driver Authentication**: Secure login system
  - **Session Management**: Persistent login sessions
  - **Profile Access**: Quick access to driver information

#### The Driver Dashboard
- **Access**: `/driver` (main driver interface)
- **Features**:
  - **Active Batches**: Current delivery assignments
  - **Order Overview**: Orders in current batch
  - **Route Information**: Delivery route details
  - **Performance Metrics**: Delivery statistics
  - **Quick Actions**: Mark orders as delivered

#### The Driver Route Page
- **Access**: `/driver/route`
- **Features**:
  - **Route Planning**: Optimized delivery routes
  - **Map Integration**: Interactive route visualization
  - **Order Sequence**: Optimized delivery order
  - **Real-time Navigation**: Turn-by-turn directions
  - **Traffic Updates**: Real-time traffic information

#### The Driver Order Details Page
- **Access**: `/driver/order/:orderId`
- **Features**:
  - **Order Information**: Complete order details
  - **Customer Details**: Delivery address and contact info
  - **Product Information**: Items to be delivered
  - **Delivery Status**: Update delivery progress
  - **Customer Communication**: Contact customer if needed

#### The Driver Profile Page
- **Access**: `/driver/profile`
- **Features**:
  - **Personal Information**: Edit driver details
  - **Contact Information**: Update phone and email
  - **Vehicle Information**: Vehicle details and registration
  - **Performance History**: Delivery statistics and ratings

## SYSTEM FEATURES

### Real-time Updates
- **Live Order Tracking**: Real-time order status updates
- **Instant Notifications**: Push notifications for important events
- **Live Dashboard**: Real-time data across all modules

### Geographic Intelligence
- **Barangay-based Batching**: Smart geographic order grouping
- **Route Optimization**: AI-powered delivery route planning
- **Address Validation**: Map-based address verification

### Security Features
- **Authentication**: Secure user authentication system
- **Authorization**: Role-based access control
- **Data Protection**: Encrypted data transmission
- **Session Management**: Secure session handling

### Mobile Responsiveness
- **Progressive Web App**: PWA capabilities for mobile devices
- **Responsive Design**: Optimized for all screen sizes
- **Touch-friendly Interface**: Mobile-optimized interactions

### Performance Optimization
- **Lazy Loading**: Efficient component loading
- **Code Splitting**: Optimized bundle sizes
- **Caching**: Smart data caching strategies

## TROUBLESHOOTING

### Common Issues

#### Login Problems
- **Issue**: Cannot log in to the system
- **Solution**: Verify email and password, check internet connection
- **Alternative**: Use password reset functionality

#### Order Processing Issues
- **Issue**: Orders not being processed
- **Solution**: Check payment confirmation, verify order status
- **Contact**: Admin support for order verification issues

#### Delivery Tracking Issues
- **Issue**: Order status not updating
- **Solution**: Refresh page, check internet connection
- **Contact**: Driver or admin for real-time updates

#### Technical Issues
- **Issue**: System not loading or errors
- **Solution**: Clear browser cache, check internet connection
- **Contact**: Technical support for persistent issues

### Support Contacts
- **Technical Support**: [support-email]
- **Admin Support**: [admin-email]
- **Emergency Contact**: [emergency-phone]

## UPDATES AND MAINTENANCE

### System Updates
- **Automatic Updates**: System updates are applied automatically
- **Maintenance Windows**: Scheduled maintenance notifications
- **Feature Releases**: New features are announced in advance

### Data Backup
- **Automatic Backups**: Daily automated database backups
- **Data Recovery**: Point-in-time data restoration
- **Export Options**: Data export for business purposes

## CONCLUSION

DeliveryEase is a comprehensive delivery management system designed to streamline order processing, delivery management, and customer experience. The system provides real-time updates, geographic intelligence, and secure access control across all user roles.

For additional support or questions, please refer to the troubleshooting section or contact the system administrators.

