const Web3 = require("web3");

const {
  expectRevert,
  time
} = require('@openzeppelin/test-helpers');

const SmartHoldETH = artifacts.require("SmartHoldETH");
const PriceFeedMock = artifacts.require("PriceFeedMock");
const BuggyPriceFeedMock = artifacts.require("BuggyPriceFeedMock");

contract("SmartHoldETH", async (accounts) => {
  const owner = accounts[0];
  const notOwner = accounts[1];
  const value = Web3.utils.toWei("0.01", "ether");
  let lockForDays = 5;
  let deposit;
  let priceFeed;

  const mockPrice = async (priceOpts) => {
    priceFeed = await PriceFeedMock.new(priceOpts.current * 100000000)

    deposit = await SmartHoldETH.new(
      priceFeed.address,
      lockForDays,
      priceOpts.minimum,
      {
        value: value,
        from: owner
      }
    )
  }

  beforeEach(async () => {
    await mockPrice(
      { current: 0, minimum: 100 }
    );
  });

  describe("'constructor'", async () => {
    it("does not allow locking funds for too long", async () => {
      await expectRevert(
        SmartHoldETH.new(
          priceFeed.address,
          4050,
          0
        )
      , "Too long")
    });

    it("does not accept negative minimum price", async () => {
      await expectRevert(
        SmartHoldETH.new(
          priceFeed.address,
          50,
          -20
        )
      , "Minimum price")
    });

    it("deposit gets deployed to test network and accepts initial ETH transfer", async () => {
      assert.ok(deposit.address);

      const balance = await web3.eth.getBalance(deposit.address);
      assert.equal(balance, value);
    });

    it("sets the correct owner and other attributes", async () => {
      assert.equal(
        await deposit.owner(),
        owner
      );

      assert.equal(
        await deposit.lockForDays(),
        lockForDays
      );

      assert.equal(
        await deposit.minimumPrice(),
        100
      );
    });

    it("accepts more ETH transfer after deployment", async () => {
      await web3.eth.sendTransaction({
        from: accounts[0],
        to: deposit.address,
        value: value
      });

      const balance = await web3.eth.getBalance(deposit.address);
      assert.equal(balance, value * 2);
    });
  });

  describe("'withdraw'", async () => {
    it("can only be called by the deposit contract owner", async () => {
      await expectRevert(
        deposit.withdraw({from: notOwner})
      , "Access denied")
    });

    it("required time did not pass yet, it does not withdraw funds", async () => {
      const ownerBalanceBefore = await web3.eth.getBalance(owner);

      await expectRevert(
        deposit.withdraw({from: owner})
      , "Cannot withdraw")

      const balance = await web3.eth.getBalance(deposit.address);
      assert.equal(balance, value);

      const ownerBalanceAfter = await web3.eth.getBalance(owner);
      assert.ok(ownerBalanceAfter < ownerBalanceBefore);
    });

    it("required time has already passed, it withdraws funds", async () => {
      const canWithdrawBefore = await deposit.canWithdraw({from: owner});
      assert.equal(canWithdrawBefore, false);
      await time.increase(time.duration.days(lockForDays + 1));

      const canWithdrawAfter = await deposit.canWithdraw({from: owner});
      assert.equal(canWithdrawAfter, true);

      const ownerBalanceBefore = await web3.eth.getBalance(owner);
      await deposit.withdraw({from: owner});
      const balance = await web3.eth.getBalance(deposit.address);
      assert.equal(balance, 0);
      const ownerBalanceAfter = await web3.eth.getBalance(owner);
      assert.ok(ownerBalanceAfter > ownerBalanceBefore);
    });

    describe("withdrawing based on price", async () => {
      describe("required min price is met", async () => {
        beforeEach(async () => {
          await mockPrice(
            { current: 123, minimum: 100 }
          );
        });

        it("it withdraws funds", async () => {
          const canWithdraw = await deposit.canWithdraw({from: owner});
          assert.equal(canWithdraw, true);
        });
      });

      describe("required min price is not met", async () => {
        beforeEach(async () => {
          await mockPrice(
            { current: 90, minimum: 100 }
          );
        });

        it("it does not withdraw funds", async () => {
          const canWithdraw = await deposit.canWithdraw({from: owner});
          assert.equal(canWithdraw, false);
        });
      });

      describe("contract does not use price condition for withdrawal and time did not pass yet", async () => {
        beforeEach(async () => {
          await mockPrice(
            { current: 100, minimum: 0 }
          );
        });

        it("it does not withdraw funds", async () => {
          const canWithdraw = await deposit.canWithdraw({from: owner});
          assert.equal(canWithdraw, false);
        });
      });

      describe("price feed execution returns error and required time has not yet passed", async () => {
        beforeEach(async () => {
          priceFeed = await BuggyPriceFeedMock.new()

          deposit = await SmartHoldETH.new(
            priceFeed.address,
            lockForDays,
            100,
            {
              value: value,
              from: owner
            }
          )
        });

        it("crashes", async () => {
          await expectRevert(
            deposit.canWithdraw({from: owner})
          , "bug")
        });
      });

      describe("price feed execution returns error and required time has already passed", async () => {
        beforeEach(async () => {
          priceFeed = await BuggyPriceFeedMock.new()

          deposit = await SmartHoldETH.new(
            priceFeed.address,
            lockForDays,
            100,
            {
              value: value,
              from: owner
            }
          )
        });

        it("it withdraws funds", async () => {
          await time.increase(time.duration.days(lockForDays + 1));
          const canWithdraw = await deposit.canWithdraw({from: owner});
          assert.equal(canWithdraw, true);
        });
      });
    });
  });
});
