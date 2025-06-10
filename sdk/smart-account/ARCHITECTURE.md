# Smart Account SDK Architecture Guide

## 🏗️ Recommended Layered Architecture

For your **Frontend → Backend → gRPC → Nitro TEE** setup, we recommend a **hybrid approach** with three layers:

### Layer 1: 🔧 **Core Functions** (Always Available)
```typescript
// Direct imports for maximum flexibility
import { createSmartAccount } from '@astrolabe/smart-account/instructions';
import { createTransaction } from '@astrolabe/smart-account/instructions';
```
**Use when**: Complex custom workflows, performance optimization, specific edge cases

### Layer 2: 🎯 **TransactionBuilder** (Perfect for Your Use Case)
```typescript
// Transaction builder for cross-service workflows
import { TransactionBuilder } from '@astrolabe/smart-account';

const tx = new TransactionBuilder()
  .createSmartAccount({ ... })
  .withMetadata({ requestId: '...' })
  .buildSerializable(blockhash, feePayer);
```
**Use when**: Frontend→Backend→Signing service workflows, serialization needed

### Layer 3: 🚀 **SmartAccountClient** (High-Level Convenience)
```typescript
// High-level client for simple operations
import { SmartAccountClient } from '@astrolabe/smart-account';

const client = new SmartAccountClient(connection);
await client.createSmartAccount({ ... });
```
**Use when**: Simple operations, testing, rapid prototyping

---

## 🎯 Recommendations for Your Architecture

### ✅ **Frontend (dApp)**
**Use: TransactionBuilder**
```typescript
// Create transaction buffers that are serializable
const tx = new TransactionBuilder()
  .createSmartAccount({ ... })
  .withMetadata({ userAgent: 'MyDApp', requestId: uuid() })
  .buildSerializable(blockhash, feePayer);

// Send to backend via HTTP/WebSocket
await fetch('/api/transactions', {
  method: 'POST',
  body: JSON.stringify(tx)
});
```

**Benefits:**
- ✅ Creates serializable transaction buffers
- ✅ Small bundle size (tree-shakable)
- ✅ Perfect for cross-service communication
- ✅ Built-in metadata for tracking

### ✅ **Backend Service**
**Use: Validation + Direct Functions**
```typescript
// Receive and validate transaction buffers
function validateTransaction(tx: SerializableTransaction) {
  // Business logic validation
  if (tx.metadata.type === 'CREATE_SMART_ACCOUNT') {
    // Validate smart account creation rules
  }
  return { valid: true };
}

// Forward to signing service via gRPC
await signingService.signTransaction(tx);
```

**Benefits:**
- ✅ Lightweight validation logic
- ✅ No connection/wallet dependencies
- ✅ Easy to test and deploy
- ✅ Clear separation of concerns

### ✅ **Signing Service (Nitro TEE)**
**Use: Deserialization + Direct Functions**
```typescript
// Deserialize and sign in secure environment
const { transaction, requiredSigners } = TransactionBuilder.deserialize(serializedTx);

// Load secure keys from TEE
const secureKeys = await loadKeysFromTEE(requiredSigners);

// Sign transaction
const signedTx = await signWithSecureKeys(transaction, secureKeys);
```

**Benefits:**
- ✅ Minimal dependencies in secure environment
- ✅ Direct control over signing process
- ✅ Easy to audit and verify
- ✅ Works with versioned transactions

---

## 📊 **When to Use Each Layer**

| Use Case | Layer 1 (Direct) | Layer 2 (Builder) | Layer 3 (Client) |
|----------|-------------------|-------------------|-------------------|
| **Frontend transaction creation** | ❌ Too verbose | ✅ **Perfect** | ❌ Too opinionated |
| **Backend validation** | ✅ **Perfect** | ✅ Good | ❌ Too heavy |
| **Signing service** | ✅ **Perfect** | ✅ Good | ❌ Too heavy |
| **Simple testing/prototyping** | ❌ Too verbose | ❌ Overkill | ✅ **Perfect** |
| **Complex multi-instruction txs** | ✅ **Perfect** | ✅ Good | ❌ Limited |

---

## 🏆 **Key Benefits of This Approach**

### 1. **Optimized Bundle Sizes**
- Frontend: Only imports TransactionBuilder (~10KB)
- Backend: Only imports validation functions (~5KB)  
- Signing: Only imports deserialization (~3KB)

### 2. **Clear Separation of Concerns**
- **Frontend**: UI logic + transaction building
- **Backend**: Business logic + validation
- **Signing**: Security + key management

### 3. **Easy to Test**
```typescript
// Unit test transaction building
const tx = new TransactionBuilder().createSmartAccount({ ... });
expect(tx.metadata.type).toBe('CREATE_SMART_ACCOUNT');

// Integration test the pipeline
const serialized = builder.buildSerializable(blockhash, feePayer);
const { transaction } = TransactionBuilder.deserialize(serialized);
expect(transaction).toBeDefined();
```

### 4. **Flexible & Future-Proof**
- Add new instruction types easily
- Extend metadata for tracking/analytics
- Support multiple signing backends
- Easy to optimize performance per service

---

## 🚀 **Migration Strategy**

### Phase 1: Start with TransactionBuilder
```typescript
// Replace your current manual instruction building
const tx = new TransactionBuilder()
  .createSmartAccount({ ... })
  .buildSerializable(blockhash, feePayer);
```

### Phase 2: Add SmartAccountClient for Simple Cases
```typescript
// Use client for one-off operations
const client = new SmartAccountClient(connection);
await client.createSmartAccount({ ... });
```

### Phase 3: Optimize with Direct Functions
```typescript
// Use direct functions for performance-critical paths
import { createSmartAccount } from '@astrolabe/smart-account/instructions';
const ix = createSmartAccount({ ... });
```

---

## 💡 **Best Practices**

1. **Use TypeScript**: Full type safety across all layers
2. **Validate Early**: Check transactions in frontend before sending
3. **Log Everything**: Use metadata for tracing across services
4. **Test Serialization**: Ensure transactions survive the pipeline
5. **Monitor Performance**: Track bundle sizes and RPC calls

This architecture gives you the **flexibility of direct functions** with the **convenience of high-level abstractions**, perfectly suited for your microservice workflow! 🎯 